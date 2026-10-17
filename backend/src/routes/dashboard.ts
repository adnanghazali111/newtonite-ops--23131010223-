import { Router, Request, Response } from 'express';
import { query } from '../db/pool.js';
import { authenticate, type AuthUser } from '../middleware/auth.js';
import { getUserTeamIds } from '../services/authorize.js';

const router = Router();

router.use(authenticate);

// GET /api/dashboard/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const teamIds = getUserTeamIds(user);

    if (teamIds.length === 0) {
      return res.json({
        assignedToMe: 0,
        unassignedUrgent: 0,
        awaitingMyApproval: 0,
        totalOpen: 0,
        totalInProgress: 0,
        totalResolved: 0,
        recentActivity: [],
      });
    }

    // Counts in parallel
    const [
      assignedToMe,
      unassignedUrgent,
      awaitingMyApproval,
      totalOpen,
      totalInProgress,
      totalResolved,
      recentActivity,
    ] = await Promise.all([
      // Items assigned to me that are not closed
      query(
        `SELECT COUNT(*) as count FROM work_items
         WHERE assignee_id = $1 AND team_id = ANY($2) AND status NOT IN ('Closed', 'Resolved')`,
        [user.id, teamIds]
      ),
      // Unassigned items with High or Critical priority
      query(
        `SELECT COUNT(*) as count FROM work_items
         WHERE assignee_id IS NULL AND team_id = ANY($1) AND priority IN ('High', 'Critical')
         AND status = 'Open'`,
        [teamIds]
      ),
      // Items awaiting approval where user is Lead/Admin (not creator)
      query(
        `SELECT COUNT(*) as count FROM work_items w
         JOIN memberships m ON m.team_id = w.team_id AND m.user_id = $1
         WHERE w.status = 'AwaitingApproval'
         AND w.team_id = ANY($2)
         AND m.role IN ('Lead', 'Admin')
         AND w.created_by != $1`,
        [user.id, teamIds]
      ),
      query(
        `SELECT COUNT(*) as count FROM work_items
         WHERE team_id = ANY($1) AND status = 'Open'`,
        [teamIds]
      ),
      query(
        `SELECT COUNT(*) as count FROM work_items
         WHERE team_id = ANY($1) AND status = 'InProgress'`,
        [teamIds]
      ),
      query(
        `SELECT COUNT(*) as count FROM work_items
         WHERE team_id = ANY($1) AND status = 'Resolved'`,
        [teamIds]
      ),
      // Recent activity across user's teams
      query(
        `SELECT ae.id, ae.work_item_id, ae.event_type, ae.payload, ae.created_at,
                u.display_name as actor_name,
                w.title as work_item_title
         FROM activity_events ae
         JOIN users u ON u.id = ae.actor_id
         JOIN work_items w ON w.id = ae.work_item_id
         WHERE ae.team_id = ANY($1)
         ORDER BY ae.created_at DESC, ae.id DESC
         LIMIT 15`,
        [teamIds]
      ),
    ]);

    res.json({
      assignedToMe: parseInt(assignedToMe.rows[0].count),
      unassignedUrgent: parseInt(unassignedUrgent.rows[0].count),
      awaitingMyApproval: parseInt(awaitingMyApproval.rows[0].count),
      totalOpen: parseInt(totalOpen.rows[0].count),
      totalInProgress: parseInt(totalInProgress.rows[0].count),
      totalResolved: parseInt(totalResolved.rows[0].count),
      recentActivity: recentActivity.rows.map((r) => ({
        id: r.id,
        workItemId: r.work_item_id,
        workItemTitle: r.work_item_title,
        eventType: r.event_type,
        payload: r.payload,
        actorName: r.actor_name,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
