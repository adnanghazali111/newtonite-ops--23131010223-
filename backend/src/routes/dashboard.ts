import { Router, Request, Response } from 'express';
import { WorkItemPriority, WorkItemStatus } from '../generated/prisma/client.js';
import { prisma } from '../db/prisma.js';
import { authenticate, type AuthUser } from '../middleware/auth.js';
import { getUserTeamIds } from '../services/authorize.js';

const router = Router();

router.use(authenticate);

// GET /api/dashboard/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user: AuthUser }).user;
    const teamIds = getUserTeamIds(user);
    const approverTeamIds = user.memberships
      .filter((membership) => membership.role === 'Lead' || membership.role === 'Admin')
      .map((membership) => membership.teamId);

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
      prisma.workItem.count({
        where: {
          assigneeId: user.id,
          teamId: { in: teamIds },
          status: { notIn: [WorkItemStatus.Closed, WorkItemStatus.Resolved] },
        },
      }),
      // Unassigned items with High or Critical priority
      prisma.workItem.count({
        where: {
          assigneeId: null,
          teamId: { in: teamIds },
          priority: { in: [WorkItemPriority.High, WorkItemPriority.Critical] },
          status: WorkItemStatus.Open,
        },
      }),
      // Items awaiting approval where user is Lead/Admin (not creator)
      prisma.workItem.count({
        where: {
          status: WorkItemStatus.AwaitingApproval,
          teamId: { in: approverTeamIds },
          createdBy: { not: user.id },
        },
      }),
      prisma.workItem.count({ where: { teamId: { in: teamIds }, status: WorkItemStatus.Open } }),
      prisma.workItem.count({ where: { teamId: { in: teamIds }, status: WorkItemStatus.InProgress } }),
      prisma.workItem.count({ where: { teamId: { in: teamIds }, status: WorkItemStatus.Resolved } }),
      // Recent activity across user's teams
      prisma.activityEvent.findMany({
        where: { teamId: { in: teamIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 15,
        select: {
          id: true,
          workItemId: true,
          eventType: true,
          payload: true,
          createdAt: true,
          actor: { select: { displayName: true } },
          workItem: { select: { title: true } },
        },
      }),
    ]);

    res.json({
      assignedToMe,
      unassignedUrgent,
      awaitingMyApproval,
      totalOpen,
      totalInProgress,
      totalResolved,
      recentActivity: recentActivity.map((event) => ({
        id: event.id,
        workItemId: event.workItemId,
        workItemTitle: event.workItem.title,
        eventType: event.eventType,
        payload: event.payload,
        actorName: event.actor.displayName,
        createdAt: event.createdAt,
      })),
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
