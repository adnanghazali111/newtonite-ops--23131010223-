import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query, transaction } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, getUserTeamIds, getUserRole } from '../services/authorize.js';
import { validateTransition } from '../services/workflow.js';

const router = Router();
router.use(authenticate);

const workItemStatuses = ['Open', 'InProgress', 'AwaitingApproval', 'Resolved', 'Closed'] as const;
const workItemPriorities = ['Low', 'Medium', 'High', 'Critical'] as const;
const uuidSchema = z.string().uuid();

function getItemId(req: Request, res: Response): string | null {
  const parsed = uuidSchema.safeParse(req.params.id);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid item ID' });
    return null;
  }
  return parsed.data;
}

// ─── Helpers ────────────────────────────────────────────────

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (parsed.createdAt && parsed.id) return parsed;
    return null;
  } catch {
    return null;
  }
}

function hashBody(body: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(sortObjectKeys(body)))
    .digest('hex');
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObjectKeys(child)]),
    );
  }
  return value;
}

async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM memberships WHERE user_id = $1 AND team_id = $2',
    [userId, teamId],
  );
  return result.rows.length > 0;
}

// ─── GET / — List Items ────────────────────────────────────

const listQuerySchema = z.object({
  status: z.enum(workItemStatuses).optional(),
  priority: z.enum(workItemPriorities).optional(),
  assigneeId: z.string().uuid().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  teamId: z.string().uuid().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { status, priority, assigneeId, q, cursor, limit, teamId } = parsed.data;
    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);

    if (userTeamIds.length === 0) {
      return res.json({ items: [], nextCursor: null, hasMore: false });
    }

    // Determine team scope
    let scopeTeamIds: string[];
    if (teamId) {
      if (!userTeamIds.includes(teamId)) {
        return res.status(404).json({ error: 'Team not found' });
      }
      scopeTeamIds = [teamId];
    } else {
      scopeTeamIds = userTeamIds;
    }

    // Build query
    const conditions: string[] = ['w.team_id = ANY($1)'];
    const params: unknown[] = [scopeTeamIds];
    let paramIdx = 2;

    if (status) {
      conditions.push(`w.status = $${paramIdx}::work_item_status`);
      params.push(status);
      paramIdx++;
    }

    if (priority) {
      conditions.push(`w.priority = $${paramIdx}::work_item_priority`);
      params.push(priority);
      paramIdx++;
    }

    if (assigneeId) {
      conditions.push(`w.assignee_id = $${paramIdx}`);
      params.push(assigneeId);
      paramIdx++;
    }

    if (q) {
      conditions.push(`w.search_vector @@ plainto_tsquery('english', $${paramIdx})`);
      params.push(q);
      paramIdx++;
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      conditions.push(`(w.created_at, w.id) < ($${paramIdx}, $${paramIdx + 1})`);
      params.push(decoded.createdAt, decoded.id);
      paramIdx += 2;
    }

    const whereClause = conditions.join(' AND ');

    const sql = `
      SELECT w.*, 
             creator.display_name AS creator_name,
             assignee.display_name AS assignee_name,
             t.name AS team_name
      FROM work_items w
      JOIN users creator ON creator.id = w.created_by
      LEFT JOIN users assignee ON assignee.id = w.assignee_id
      JOIN teams t ON t.id = w.team_id
      WHERE ${whereClause}
      ORDER BY w.created_at DESC, w.id DESC
      LIMIT $${paramIdx}
    `;
    params.push(limit + 1);

    const result = await query(sql, params);
    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].created_at, items[items.length - 1].id)
      : null;

    res.json({
      items: items.map(mapItem),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error('List items error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST / — Create Item ──────────────────────────────────

const createItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().default(''),
  type: z.enum(['Task', 'Incident', 'Request', 'Change']).default('Task'),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  teamId: z.string().uuid(),
  assigneeId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional().nullable(),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const user = req.user!;
    const { title, description, type, priority, teamId, assigneeId, dueAt } = parsed.data;

    // Authorization check. A member may create an item and set themselves as
    // assignee, but assigning another person is reserved for Leads and Admins.
    const authResult = authorize(user, 'create', { teamId });
    if (!authResult.allowed) {
      return res.status(403).json({ error: authResult.reason });
    }

    if (assigneeId && assigneeId !== user.id) {
      const assignResult = authorize(user, 'assign', { teamId });
      if (!assignResult.allowed) {
        return res.status(403).json({ error: assignResult.reason });
      }
    }

    if (assigneeId && !(await isTeamMember(assigneeId, teamId))) {
      return res.status(400).json({ error: 'Assignee must belong to the selected team' });
    }

    const idempotencyKey = req.get('Idempotency-Key') || undefined;
    if (idempotencyKey && idempotencyKey.length > 255) {
      return res.status(400).json({ error: 'Idempotency-Key must be at most 255 characters' });
    }
    const bodyHash = hashBody(parsed.data);

    const result = await transaction(async (client) => {
      // Serialize matching user/key pairs so parallel retries cannot each
      // create an item before the unique-key constraint is evaluated.
      if (idempotencyKey) {
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
          [user.id, idempotencyKey],
        );

        const existing = await client.query(
          `SELECT request_hash, response_status, response_body
             FROM idempotency_keys
            WHERE user_id = $1 AND key = $2`,
          [user.id, idempotencyKey],
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          if (row.request_hash !== bodyHash) {
            return {
              status: 409,
              body: { error: 'Idempotency key reused with different payload' },
            };
          }
          return { status: row.response_status, body: row.response_body };
        }
      }

      const itemResult = await client.query(
        `INSERT INTO work_items (title, description, type, priority, team_id, assignee_id, created_by, due_at)
         VALUES ($1, $2, $3::work_item_type, $4::work_item_priority, $5, $6, $7, $8)
         RETURNING *`,
        [title, description, type, priority, teamId, assigneeId || null, user.id, dueAt || null]
      );

      const newItem = itemResult.rows[0];

      // Insert activity event
      await client.query(
        `INSERT INTO activity_events (work_item_id, team_id, actor_id, event_type, payload)
         VALUES ($1, $2, $3, 'created', $4)`,
        [newItem.id, teamId, user.id, JSON.stringify({
          title, type, priority, status: 'Open',
          assigneeId: assigneeId || null,
        })]
      );

      const fullItem = await client.query(
        `SELECT w.*, creator.display_name AS creator_name,
                assignee.display_name AS assignee_name, t.name AS team_name
           FROM work_items w
           JOIN users creator ON creator.id = w.created_by
           LEFT JOIN users assignee ON assignee.id = w.assignee_id
           JOIN teams t ON t.id = w.team_id
          WHERE w.id = $1`,
        [newItem.id],
      );
      const responseBody = { item: mapItem(fullItem.rows[0]) };

      // Store idempotency key
      if (idempotencyKey) {
        await client.query(
          `INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, idempotencyKey, bodyHash, 201, JSON.stringify(responseBody)]
        );
      }

      return { status: 201, body: responseBody };
    });

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('Create item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id — Get Item Detail ────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const itemId = getItemId(req, res);
    if (!itemId) return;
    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);

    const result = await query(
      `SELECT w.*, creator.display_name AS creator_name, assignee.display_name AS assignee_name, t.name AS team_name
       FROM work_items w
       JOIN users creator ON creator.id = w.created_by
       LEFT JOIN users assignee ON assignee.id = w.assignee_id
       JOIN teams t ON t.id = w.team_id
       WHERE w.id = $1 AND w.team_id = ANY($2)`,
      [itemId, userTeamIds]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ item: mapItem(result.rows[0]) });
  } catch (err) {
    console.error('Get item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /:id — Update Item ──────────────────────────────

const updateItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  priority: z.enum(workItemPriorities).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  version: z.number().int().positive(),
}).refine(
  (data) => data.title !== undefined || data.description !== undefined ||
    data.priority !== undefined || data.dueAt !== undefined || data.assigneeId !== undefined,
  { message: 'Provide at least one field to update' },
);

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const itemId = getItemId(req, res);
    if (!itemId) return;
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);
    const { version, assigneeId, ...fields } = parsed.data;

    // Fetch current item
    const current = await query(
      'SELECT * FROM work_items WHERE id = $1 AND team_id = ANY($2)',
      [itemId, userTeamIds]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = current.rows[0];

    // Check edit or assign authorization
    const action = assigneeId !== undefined ? 'assign' : 'edit';
    const authResult = authorize(user, action, {
      teamId: item.team_id,
      createdBy: item.created_by,
      assigneeId: item.assignee_id,
    });

    if (!authResult.allowed) {
      return res.status(403).json({ error: authResult.reason });
    }

    if (assigneeId && !(await isTeamMember(assigneeId, item.team_id))) {
      return res.status(400).json({ error: 'Assignee must belong to the item team' });
    }

    // Build SET clause dynamically
    const setClauses: string[] = ['version = version + 1', 'updated_at = NOW()'];
    const setParams: unknown[] = [];
    let setIdx = 1;
    const changes: Record<string, unknown> = {};

    if (fields.title !== undefined) {
      setClauses.push(`title = $${setIdx}`);
      setParams.push(fields.title);
      changes.title = { from: item.title, to: fields.title };
      setIdx++;
    }
    if (fields.description !== undefined) {
      setClauses.push(`description = $${setIdx}`);
      setParams.push(fields.description);
      changes.description = { from: item.description, to: fields.description };
      setIdx++;
    }
    if (fields.priority !== undefined) {
      setClauses.push(`priority = $${setIdx}::work_item_priority`);
      setParams.push(fields.priority);
      changes.priority = { from: item.priority, to: fields.priority };
      setIdx++;
    }
    if (fields.dueAt !== undefined) {
      setClauses.push(`due_at = $${setIdx}`);
      setParams.push(fields.dueAt);
      changes.dueAt = { from: item.due_at, to: fields.dueAt };
      setIdx++;
    }
    if (assigneeId !== undefined) {
      setClauses.push(`assignee_id = $${setIdx}`);
      setParams.push(assigneeId);
      changes.assigneeId = { from: item.assignee_id, to: assigneeId };
      setIdx++;
    }

    // Conditional update with version check
    const updateResult = await transaction(async (client) => {
      const updated = await client.query(
        `UPDATE work_items SET ${setClauses.join(', ')}
         WHERE id = $${setIdx} AND team_id = $${setIdx + 1} AND version = $${setIdx + 2}
         RETURNING *`,
        [...setParams, itemId, item.team_id, version]
      );

      if (updated.rows.length === 0) {
        return null;
      }

      // Activity event
      await client.query(
        `INSERT INTO activity_events (work_item_id, team_id, actor_id, event_type, payload)
         VALUES ($1, $2, $3, 'updated', $4)`,
        [itemId, item.team_id, user.id, JSON.stringify({ changes })]
      );

      return updated.rows[0];
    });

    if (!updateResult) {
      return res.status(409).json({ error: 'Conflict: item has been modified. Reload and try again.' });
    }

    // Fetch with names
    const fullItem = await query(
      `SELECT w.*, creator.display_name AS creator_name, assignee.display_name AS assignee_name, t.name AS team_name
       FROM work_items w
       JOIN users creator ON creator.id = w.created_by
       LEFT JOIN users assignee ON assignee.id = w.assignee_id
       JOIN teams t ON t.id = w.team_id
       WHERE w.id = $1`,
      [itemId]
    );

    res.json({ item: mapItem(fullItem.rows[0]) });
  } catch (err) {
    console.error('Update item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/claim — Claim Item ──────────────────────────

const claimSchema = z.object({
  version: z.number().int().positive(),
});

router.post('/:id/claim', async (req: Request, res: Response) => {
  try {
    const itemId = getItemId(req, res);
    if (!itemId) return;
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);
    const { version } = parsed.data;

    // Verify item exists and user has team access
    const current = await query(
      'SELECT * FROM work_items WHERE id = $1 AND team_id = ANY($2)',
      [itemId, userTeamIds]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = current.rows[0];

    // Authorization
    const authResult = authorize(user, 'claim', { teamId: item.team_id });
    if (!authResult.allowed) {
      return res.status(403).json({ error: authResult.reason });
    }

    // Atomic claim — conditional update
    const claimResult = await transaction(async (client) => {
      const updated = await client.query(
        `UPDATE work_items
         SET assignee_id = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND team_id = $3 AND assignee_id IS NULL AND version = $4
         RETURNING *`,
        [user.id, itemId, item.team_id, version]
      );

      if (updated.rows.length === 0) {
        return null;
      }

      await client.query(
        `INSERT INTO activity_events (work_item_id, team_id, actor_id, event_type, payload)
         VALUES ($1, $2, $3, 'claimed', $4)`,
        [itemId, item.team_id, user.id, JSON.stringify({ assigneeId: user.id })]
      );

      return updated.rows[0];
    });

    if (!claimResult) {
      return res.status(409).json({ error: 'Conflict: item already assigned or version mismatch' });
    }

    const fullItem = await query(
      `SELECT w.*, creator.display_name AS creator_name, assignee.display_name AS assignee_name, t.name AS team_name
       FROM work_items w
       JOIN users creator ON creator.id = w.created_by
       LEFT JOIN users assignee ON assignee.id = w.assignee_id
       JOIN teams t ON t.id = w.team_id
       WHERE w.id = $1`,
      [itemId]
    );

    res.json({ item: mapItem(fullItem.rows[0]) });
  } catch (err) {
    console.error('Claim item error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/transition — Status Transition ─────────────

const transitionSchema = z.object({
  to: z.enum(workItemStatuses),
  version: z.number().int().positive(),
  reason: z.string().max(1000).optional(),
});

router.post('/:id/transition', async (req: Request, res: Response) => {
  try {
    const itemId = getItemId(req, res);
    if (!itemId) return;
    const parsed = transitionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);
    const { to, version, reason } = parsed.data;

    // Fetch item
    const current = await query(
      'SELECT * FROM work_items WHERE id = $1 AND team_id = ANY($2)',
      [itemId, userTeamIds]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = current.rows[0];
    const userRole = getUserRole(user, item.team_id);

    if (!userRole) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Validate transition
    const validation = validateTransition(
      item.status,
      to,
      userRole,
      user.id,
      { created_by: item.created_by, assignee_id: item.assignee_id }
    );

    if (!validation.valid) {
      return res.status(403).json({ error: validation.reason });
    }

    // Conditional status update
    const transitionResult = await transaction(async (client) => {
      const updated = await client.query(
        `UPDATE work_items
         SET status = $1::work_item_status, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND team_id = $3 AND status = $4::work_item_status AND version = $5
         RETURNING *`,
        [to, itemId, item.team_id, item.status, version]
      );

      if (updated.rows.length === 0) {
        return null;
      }

      await client.query(
        `INSERT INTO activity_events (work_item_id, team_id, actor_id, event_type, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          itemId,
          item.team_id,
          user.id,
          'transition',
          JSON.stringify({ from: item.status, to, reason: reason || null }),
        ]
      );

      return updated.rows[0];
    });

    if (!transitionResult) {
      return res.status(409).json({ error: 'Conflict: item status or version has changed' });
    }

    const fullItem = await query(
      `SELECT w.*, creator.display_name AS creator_name, assignee.display_name AS assignee_name, t.name AS team_name
       FROM work_items w
       JOIN users creator ON creator.id = w.created_by
       LEFT JOIN users assignee ON assignee.id = w.assignee_id
       JOIN teams t ON t.id = w.team_id
       WHERE w.id = $1`,
      [itemId]
    );

    res.json({ item: mapItem(fullItem.rows[0]) });
  } catch (err) {
    console.error('Transition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /:id/comments — Add Comment ─────────────────────

const commentSchema = z.object({
  body: z.string().min(1).max(5000),
});

router.post('/:id/comments', async (req: Request, res: Response) => {
  try {
    const itemId = getItemId(req, res);
    if (!itemId) return;
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);
    const { body } = parsed.data;

    // Verify item
    const current = await query(
      'SELECT * FROM work_items WHERE id = $1 AND team_id = ANY($2)',
      [itemId, userTeamIds]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = current.rows[0];

    // Authorization
    const authResult = authorize(user, 'comment', { teamId: item.team_id });
    if (!authResult.allowed) {
      return res.status(403).json({ error: authResult.reason });
    }

    const comment = await transaction(async (client) => {
      const commentResult = await client.query(
        `INSERT INTO comments (work_item_id, team_id, author_id, body)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [itemId, item.team_id, user.id, body]
      );

      await client.query(
        `INSERT INTO activity_events (work_item_id, team_id, actor_id, event_type, payload)
         VALUES ($1, $2, $3, 'commented', $4)`,
        [itemId, item.team_id, user.id, JSON.stringify({ commentId: commentResult.rows[0].id, body: body.substring(0, 200) })]
      );

      return commentResult.rows[0];
    });

    res.status(201).json({
      comment: {
        id: comment.id,
        workItemId: comment.work_item_id,
        authorId: comment.author_id,
        authorName: user.displayName,
        body: comment.body,
        createdAt: comment.created_at,
      },
    });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/comments — List Comments ─────────────────────

router.get('/:id/comments', async (req: Request, res: Response) => {
  try {
    const itemId = getItemId(req, res);
    if (!itemId) return;
    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);

    // Verify item access
    const current = await query(
      'SELECT team_id FROM work_items WHERE id = $1 AND team_id = ANY($2)',
      [itemId, userTeamIds]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const result = await query(
      `SELECT c.*, u.display_name AS author_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.work_item_id = $1
       ORDER BY c.created_at ASC`,
      [itemId]
    );

    res.json({
      comments: result.rows.map((r) => ({
        id: r.id,
        workItemId: r.work_item_id,
        authorId: r.author_id,
        authorName: r.author_name,
        body: r.body,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('List comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /:id/activity — Activity Timeline ─────────────────

router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const itemId = getItemId(req, res);
    if (!itemId) return;
    const user = req.user!;
    const userTeamIds = getUserTeamIds(user);

    const limitSchema = z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    });

    const parsed = limitSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query' });
    }

    const { cursor, limit } = parsed.data;

    // Verify item access
    const current = await query(
      'SELECT team_id FROM work_items WHERE id = $1 AND team_id = ANY($2)',
      [itemId, userTeamIds]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const conditions: string[] = ['ae.work_item_id = $1'];
    const params: unknown[] = [itemId];
    let paramIdx = 2;

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      conditions.push(`(ae.created_at, ae.id) < ($${paramIdx}, $${paramIdx + 1})`);
      params.push(decoded.createdAt, decoded.id);
      paramIdx += 2;
    }

    const result = await query(
      `SELECT ae.*, u.display_name AS actor_name
       FROM activity_events ae
       JOIN users u ON u.id = ae.actor_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ae.created_at DESC, ae.id DESC
       LIMIT $${paramIdx}`,
      [...params, limit + 1]
    );

    const hasMore = result.rows.length > limit;
    const events = hasMore ? result.rows.slice(0, limit) : result.rows;

    const nextCursor = hasMore && events.length > 0
      ? encodeCursor(events[events.length - 1].created_at, events[events.length - 1].id)
      : null;

    res.json({
      events: events.map((r) => ({
        id: r.id,
        workItemId: r.work_item_id,
        actorId: r.actor_id,
        actorName: r.actor_name,
        eventType: r.event_type,
        payload: r.payload,
        createdAt: r.created_at,
      })),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error('Activity timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Helper: Map DB row to API shape ────────────────────────

function mapItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || null,
    createdBy: row.created_by,
    creatorName: row.creator_name,
    teamId: row.team_id,
    teamName: row.team_name,
    dueAt: row.due_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
