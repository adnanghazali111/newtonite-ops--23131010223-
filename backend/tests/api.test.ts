import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';

const { Pool } = pg;

// Use the test database URL from setup.ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const request = supertest(app);

// ─── Test Data ──────────────────────────────────────────────

let aliceToken: string;
let bobToken: string;
let carolToken: string;
let daveToken: string;
let eveToken: string;

let opsTeamId: string;
let engTeamId: string;

let aliceId: string;
let bobId: string;
let carolId: string;
let eveId: string;

async function login(email: string, password = 'password123'): Promise<string> {
  const res = await request
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.token;
}

// ─── Setup / Teardown ───────────────────────────────────────

beforeAll(async () => {
  // Run migrations on test database
  const { runMigrations } = await import('../src/db/migrate.js');
  await runMigrations();

  // Seed test data
  const passwordHash = await bcrypt.hash('password123', 10);

  // Clean existing test data
  await pool.query('DELETE FROM activity_events');
  await pool.query('DELETE FROM comments');
  await pool.query('DELETE FROM idempotency_keys');
  await pool.query('DELETE FROM outbox_jobs');
  await pool.query('DELETE FROM work_items');
  await pool.query('DELETE FROM memberships');
  await pool.query('DELETE FROM users');
  await pool.query('DELETE FROM teams');

  // Create teams
  const opsTeam = await pool.query(
    "INSERT INTO teams (name) VALUES ('TestOps') RETURNING id"
  );
  opsTeamId = opsTeam.rows[0].id;

  const engTeam = await pool.query(
    "INSERT INTO teams (name) VALUES ('TestEng') RETURNING id"
  );
  engTeamId = engTeam.rows[0].id;

  // Create users
  const users = [
    { email: 'alice-test@test.com', name: 'Alice Test' },
    { email: 'bob-test@test.com', name: 'Bob Test' },
    { email: 'carol-test@test.com', name: 'Carol Test' },
    { email: 'dave-test@test.com', name: 'Dave Test' },
    { email: 'eve-test@test.com', name: 'Eve Test' },
  ];

  for (const u of users) {
    await pool.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3)',
      [u.email, passwordHash, u.name]
    );
  }

  const aliceRow = await pool.query("SELECT id FROM users WHERE email = 'alice-test@test.com'");
  aliceId = aliceRow.rows[0].id;
  const bobRow = await pool.query("SELECT id FROM users WHERE email = 'bob-test@test.com'");
  bobId = bobRow.rows[0].id;
  const carolRow = await pool.query("SELECT id FROM users WHERE email = 'carol-test@test.com'");
  carolId = carolRow.rows[0].id;
  const daveRow = await pool.query("SELECT id FROM users WHERE email = 'dave-test@test.com'");
  const eveRow = await pool.query("SELECT id FROM users WHERE email = 'eve-test@test.com'");
  eveId = eveRow.rows[0].id;

  // Memberships:
  // TestOps: Alice=Admin, Bob=Lead, Carol=Member, Dave=Viewer
  // TestEng: Eve=Lead (not in TestOps)
  await pool.query("INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Admin')", [aliceId, opsTeamId]);
  await pool.query("INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Lead')", [bobId, opsTeamId]);
  await pool.query("INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Member')", [carolId, opsTeamId]);
  await pool.query("INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Viewer')", [daveRow.rows[0].id, opsTeamId]);
  await pool.query("INSERT INTO memberships (user_id, team_id, role) VALUES ($1, $2, 'Lead')", [eveRow.rows[0].id, engTeamId]);

  // Get tokens
  aliceToken = await login('alice-test@test.com');
  bobToken = await login('bob-test@test.com');
  carolToken = await login('carol-test@test.com');
  daveToken = await login('dave-test@test.com');
  eveToken = await login('eve-test@test.com');
});

afterAll(async () => {
  await pool.end();
});

// ─── Helper: Create a work item ─────────────────────────────

async function createItem(token: string, overrides: Record<string, unknown> = {}) {
  const res = await request
    .post('/api/items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `Test item ${Date.now()}`,
      description: 'Test description',
      type: 'Task',
      priority: 'Medium',
      teamId: opsTeamId,
      ...overrides,
    });
  return res;
}

// ─── Tests ──────────────────────────────────────────────────

describe('Auth', () => {
  it('returns 401 for invalid credentials', async () => {
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'alice-test@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for missing token', async () => {
    const res = await request.get('/api/items');
    expect(res.status).toBe(401);
  });

  it('returns user with memberships on /me', async () => {
    const res = await request
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice-test@test.com');
    expect(res.body.user.memberships).toHaveLength(1);
    expect(res.body.user.memberships[0].role).toBe('Admin');
  });
});

describe('Resource Authorization', () => {
  it('prevents a non-team user from reading items', async () => {
    // Eve is only in TestEng, not TestOps
    const createRes = await createItem(aliceToken);
    expect(createRes.status).toBe(201);

    const res = await request
      .get(`/api/items/${createRes.body.item.id}`)
      .set('Authorization', `Bearer ${eveToken}`);
    expect(res.status).toBe(404);
  });

  it('prevents a non-team user from editing items', async () => {
    const createRes = await createItem(aliceToken);
    const res = await request
      .patch(`/api/items/${createRes.body.item.id}`)
      .set('Authorization', `Bearer ${eveToken}`)
      .send({ title: 'Hacked', version: 1 });
    expect(res.status).toBe(404);
  });

  it('prevents a non-team user from claiming items', async () => {
    const createRes = await createItem(aliceToken);
    const res = await request
      .post(`/api/items/${createRes.body.item.id}/claim`)
      .set('Authorization', `Bearer ${eveToken}`)
      .send({ version: 1 });
    expect(res.status).toBe(404);
  });

  it('prevents a non-team user from transitioning items', async () => {
    const createRes = await createItem(aliceToken);
    const res = await request
      .post(`/api/items/${createRes.body.item.id}/transition`)
      .set('Authorization', `Bearer ${eveToken}`)
      .send({ to: 'InProgress', version: 1 });
    expect(res.status).toBe(404);
  });

  it('prevents a non-team user from commenting', async () => {
    const createRes = await createItem(aliceToken);
    const res = await request
      .post(`/api/items/${createRes.body.item.id}/comments`)
      .set('Authorization', `Bearer ${eveToken}`)
      .send({ body: 'Unauthorized comment' });
    expect(res.status).toBe(404);
  });

  it('prevents Viewer from creating items', async () => {
    const res = await createItem(daveToken);
    expect(res.status).toBe(403);
  });

  it('prevents Viewer from commenting', async () => {
    const createRes = await createItem(aliceToken);
    const res = await request
      .post(`/api/items/${createRes.body.item.id}/comments`)
      .set('Authorization', `Bearer ${daveToken}`)
      .send({ body: 'Viewer comment' });
    expect(res.status).toBe(403);
  });
});

describe('Concurrent Claim', () => {
  it('allows exactly one claimant when two claim simultaneously', async () => {
    // Create unassigned item
    const createRes = await createItem(aliceToken);
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.item.id;
    const version = createRes.body.item.version;

    // Carol (Member) and Bob (Lead) both try to claim
    const [res1, res2] = await Promise.all([
      request
        .post(`/api/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${carolToken}`)
        .send({ version }),
      request
        .post(`/api/items/${itemId}/claim`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ version }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Verify exactly one assignee
    const check = await request
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(check.body.item.assigneeId).toBeTruthy();
    expect(check.body.item.version).toBe(version + 1);
  });
});

describe('Stale Update (Optimistic Concurrency)', () => {
  it('rejects an update with stale version', async () => {
    const createRes = await createItem(carolToken);
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.item.id;

    // First update succeeds (version 1 -> 2)
    const update1 = await request
      .patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ title: 'Updated title', version: 1 });
    expect(update1.status).toBe(200);
    expect(update1.body.item.version).toBe(2);

    // Second update with stale version 1 fails
    const update2 = await request
      .patch(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ title: 'Stale update', version: 1 });
    expect(update2.status).toBe(409);

    // Confirm the newer values remain
    const check = await request
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(check.body.item.title).toBe('Updated title');
    expect(check.body.item.version).toBe(2);
  });
});

describe('Idempotency', () => {
  it('returns same result for duplicate request with same key', async () => {
    const key = `test-key-${Date.now()}`;
    const payload = {
      title: 'Idempotent item',
      description: 'Test',
      teamId: opsTeamId,
    };

    const res1 = await request
      .post('/api/items')
      .set('Authorization', `Bearer ${carolToken}`)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(res1.status).toBe(201);

    const res2 = await request
      .post('/api/items')
      .set('Authorization', `Bearer ${carolToken}`)
      .set('Idempotency-Key', key)
      .send(payload);
    // Second call returns the stored response
    expect(res2.status).toBe(201);

    // Only one item exists with this title
    const list = await request
      .get('/api/items?q=Idempotent+item')
      .set('Authorization', `Bearer ${carolToken}`);
    const matches = list.body.items.filter((i: { title: string }) => i.title === 'Idempotent item');
    expect(matches.length).toBe(1);
  });

  it('rejects same key with different payload', async () => {
    const key = `test-key-conflict-${Date.now()}`;

    const res1 = await request
      .post('/api/items')
      .set('Authorization', `Bearer ${carolToken}`)
      .set('Idempotency-Key', key)
      .send({ title: 'First payload', teamId: opsTeamId });
    expect(res1.status).toBe(201);

    const res2 = await request
      .post('/api/items')
      .set('Authorization', `Bearer ${carolToken}`)
      .set('Idempotency-Key', key)
      .send({ title: 'Different payload', teamId: opsTeamId });
    expect(res2.status).toBe(409);
  });

  it('serializes parallel retries with the same key into one created item', async () => {
    const key = `test-key-parallel-${Date.now()}`;
    const payload = {
      title: `Parallel idempotent item ${Date.now()}`,
      description: 'Parallel retry safety check',
      teamId: opsTeamId,
    };

    const [first, second] = await Promise.all([
      request
        .post('/api/items')
        .set('Authorization', `Bearer ${carolToken}`)
        .set('Idempotency-Key', key)
        .send(payload),
      request
        .post('/api/items')
        .set('Authorization', `Bearer ${carolToken}`)
        .set('Idempotency-Key', key)
        .send(payload),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body).toEqual(second.body);

    const count = await pool.query(
      'SELECT COUNT(*)::int AS count FROM work_items WHERE title = $1 AND team_id = $2',
      [payload.title, opsTeamId],
    );
    expect(count.rows[0].count).toBe(1);
  });
});

describe('Assignment and Request Validation', () => {
  it('requires assignees to belong to the work item team', async () => {
    const createRes = await createItem(aliceToken, { assigneeId: eveId });
    expect(createRes.status).toBe(400);

    const validItem = await createItem(aliceToken);
    const updateRes = await request
      .patch(`/api/items/${validItem.body.item.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ assigneeId: eveId, version: 1 });
    expect(updateRes.status).toBe(400);
  });

  it('does not let Members assign another user while creating an item', async () => {
    const res = await createItem(carolToken, { assigneeId: bobId });
    expect(res.status).toBe(403);
  });

  it('rejects malformed IDs and invalid enum filters with 400', async () => {
    const badId = await request
      .get('/api/items/not-a-uuid')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(badId.status).toBe(400);

    const badStatus = await request
      .get('/api/items?status=NotAStatus')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(badStatus.status).toBe(400);

    const badDueDate = await request
      .get('/api/items?dueDate=2026-02-31')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(badDueDate.status).toBe(400);
  });
});

describe('Workflow Authorization', () => {
  it('rejects direct Open -> Closed transition', async () => {
    const createRes = await createItem(aliceToken);
    const itemId = createRes.body.item.id;

    const res = await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ to: 'Closed', version: 1 });
    expect(res.status).toBe(403);

    // Verify item unchanged
    const check = await request
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(check.body.item.status).toBe('Open');
    expect(check.body.item.version).toBe(1);
  });

  it('rejects approval by a Member', async () => {
    const createRes = await createItem(aliceToken);
    const itemId = createRes.body.item.id;

    // Move through Open -> InProgress -> AwaitingApproval using Admin
    await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ to: 'InProgress', version: 1 });
    await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ to: 'AwaitingApproval', version: 2 });

    // Carol (Member) tries to approve
    const res = await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ to: 'Resolved', version: 3 });
    expect(res.status).toBe(403);

    // Verify no status change or extra activity
    const check = await request
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(check.body.item.status).toBe('AwaitingApproval');
    expect(check.body.item.version).toBe(3);
  });

  it('rejects approval by the creator (even if Lead)', async () => {
    // Bob (Lead) creates an item and tries to approve it himself
    const createRes = await createItem(bobToken);
    const itemId = createRes.body.item.id;

    // Move through workflow
    await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ to: 'InProgress', version: 1 });
    await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ to: 'AwaitingApproval', version: 2 });

    // Bob tries to approve his own item
    const res = await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ to: 'Resolved', version: 3 });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('approve');
  });

  it('allows full workflow: Open -> InProgress -> AwaitingApproval -> Resolved -> Closed', async () => {
    // Carol creates, Alice (Admin, not creator) approves
    const createRes = await createItem(carolToken);
    const itemId = createRes.body.item.id;

    // Claim (Carol)
    const claim = await request
      .post(`/api/items/${itemId}/claim`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ version: 1 });
    expect(claim.status).toBe(200);

    // Open -> InProgress
    const t1 = await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ to: 'InProgress', version: 2 });
    expect(t1.status).toBe(200);

    // InProgress -> AwaitingApproval (Carol is assignee)
    const t2 = await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ to: 'AwaitingApproval', version: 3 });
    expect(t2.status).toBe(200);

    // AwaitingApproval -> Resolved (Alice as Admin, not creator)
    const t3 = await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ to: 'Resolved', version: 4 });
    expect(t3.status).toBe(200);

    // Resolved -> Closed (Carol is creator)
    const t4 = await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ to: 'Closed', version: 5 });
    expect(t4.status).toBe(200);

    // Verify final state
    const check = await request
      .get(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(check.body.item.status).toBe('Closed');
    expect(check.body.item.version).toBe(6);
  });
});

describe('Activity Atomicity', () => {
  it('creates activity event in same transaction as item creation', async () => {
    const createRes = await createItem(carolToken);
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.item.id;

    const activityRes = await request
      .get(`/api/items/${itemId}/activity`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(activityRes.status).toBe(200);
    expect(activityRes.body.events.length).toBeGreaterThanOrEqual(1);
    expect(activityRes.body.events.some((e: { eventType: string }) => e.eventType === 'created')).toBe(true);
  });

  it('records transition activity events', async () => {
    const createRes = await createItem(aliceToken);
    const itemId = createRes.body.item.id;

    await request
      .post(`/api/items/${itemId}/transition`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ to: 'InProgress', version: 1 });

    const activityRes = await request
      .get(`/api/items/${itemId}/activity`)
      .set('Authorization', `Bearer ${aliceToken}`);

    const events = activityRes.body.events;
    expect(events.some((e: { eventType: string }) => e.eventType === 'transition')).toBe(true);
    expect(events.some((e: { eventType: string }) => e.eventType === 'created')).toBe(true);
  });
});

describe('Comments', () => {
  it('allows a Member to comment and records activity', async () => {
    const createRes = await createItem(aliceToken);
    const itemId = createRes.body.item.id;

    const commentRes = await request
      .post(`/api/items/${itemId}/comments`)
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ body: 'This is a test comment' });
    expect(commentRes.status).toBe(201);
    expect(commentRes.body.comment.body).toBe('This is a test comment');

    // Verify comment in list
    const listRes = await request
      .get(`/api/items/${itemId}/comments`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(listRes.body.comments.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Search and Pagination', () => {
  it('paginates results with cursor', async () => {
    // Create several items
    for (let i = 0; i < 5; i++) {
      await createItem(carolToken, { title: `Paginated item ${i}` });
    }

    // First page
    const page1 = await request
      .get('/api/items?limit=2')
      .set('Authorization', `Bearer ${carolToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.items.length).toBe(2);
    expect(page1.body.hasMore).toBe(true);
    expect(page1.body.nextCursor).toBeTruthy();

    // Second page
    const page2 = await request
      .get(`/api/items?limit=2&cursor=${page1.body.nextCursor}`)
      .set('Authorization', `Bearer ${carolToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.items.length).toBe(2);

    // No duplicates between pages
    const page1Ids = page1.body.items.map((i: { id: string }) => i.id);
    const page2Ids = page2.body.items.map((i: { id: string }) => i.id);
    const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
    expect(overlap.length).toBe(0);
  });

  it('filters by status', async () => {
    const res = await request
      .get('/api/items?status=Open')
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.status).toBe('Open');
    }
  });

  it('filters dashboard queues by due date and urgent unassigned work', async () => {
    const createRes = await createItem(aliceToken, {
      title: 'Urgent dated dashboard item',
      priority: 'High',
      dueAt: '2026-10-18T10:00:00.000Z',
    });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.item.id;

    const dueDate = await request
      .get('/api/items?dueDate=2026-10-18')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(dueDate.status).toBe(200);
    expect(dueDate.body.items.map((item: { id: string }) => item.id)).toContain(itemId);

    const urgent = await request
      .get('/api/items?urgentUnassigned=true')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(urgent.status).toBe(200);
    expect(urgent.body.items.map((item: { id: string }) => item.id)).toContain(itemId);
  });

  it('performs full-text search', async () => {
    await createItem(carolToken, {
      title: 'Unique searchable temperature problem',
      description: 'The HVAC system is malfunctioning',
    });

    const res = await request
      .get('/api/items?q=temperature+HVAC')
      .set('Authorization', `Bearer ${carolToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Dashboard', () => {
  it('returns scoped summary data', async () => {
    const res = await request
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('assignedToMe');
    expect(res.body).toHaveProperty('unassignedUrgent');
    expect(res.body).toHaveProperty('awaitingMyApproval');
    expect(res.body).toHaveProperty('totalOpen');
    expect(res.body).toHaveProperty('recentActivity');
    expect(Array.isArray(res.body.recentActivity)).toBe(true);
  });
});
