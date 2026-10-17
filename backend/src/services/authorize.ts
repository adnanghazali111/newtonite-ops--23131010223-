import type { AuthUser } from "../middleware/auth.js";

type Action =
  | "read"
  | "create"
  | "claim"
  | "assign"
  | "edit"
  | "comment"
  | "approve"
  | "reject"
  | "transition"
  | "manage_team";

/**
 * Evaluate whether a user is allowed to perform a given action on a resource
 * that belongs to a specific team.
 *
 * Role × Action matrix (from the blueprint):
 *   Viewer  → read
 *   Member  → read, create, claim, comment, edit (only if creator or assignee)
 *   Lead    → all except manage_team; approve/reject NOT allowed if user is creator
 *   Admin   → all except manage_team; approve/reject NOT allowed if user is creator
 *   manage_team → Admin only
 */
export function authorize(
  user: AuthUser,
  action: Action,
  resource: {
    teamId: string;
    createdBy?: string;
    assigneeId?: string | null;
  },
): { allowed: boolean; reason?: string } {
  const membership = user.memberships.find(
    (m) => m.teamId === resource.teamId,
  );

  if (!membership) {
    return { allowed: false, reason: "Not a member of this team" };
  }

  const { role } = membership;

  // --- manage_team: Admin only ---
  if (action === "manage_team") {
    if (role === "Admin") {
      return { allowed: true };
    }
    return { allowed: false, reason: "Only Admin can manage team settings" };
  }

  // --- Viewer ---
  if (role === "Viewer") {
    if (action === "read") {
      return { allowed: true };
    }
    return { allowed: false, reason: "Viewers can only read" };
  }

  // --- Member ---
  if (role === "Member") {
    const memberActions: Action[] = ["read", "create", "claim", "comment"];

    if (memberActions.includes(action)) {
      return { allowed: true };
    }

    if (action === "edit") {
      const isCreator = resource.createdBy === user.id;
      const isAssignee = resource.assigneeId === user.id;
      if (isCreator || isAssignee) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "Members can only edit items they created or are assigned to",
      };
    }

    return {
      allowed: false,
      reason: `Members cannot perform '${action}'`,
    };
  }

  // --- Lead & Admin ---
  // approve/reject NOT allowed if user is the creator of the resource
  if (action === "approve" || action === "reject") {
    if (resource.createdBy === user.id) {
      return {
        allowed: false,
        reason: "Cannot approve or reject your own item",
      };
    }
  }

  return { allowed: true };
}

/** Return array of team IDs the user belongs to. */
export function getUserTeamIds(user: AuthUser): string[] {
  return user.memberships.map((m) => m.teamId);
}

/** Return the user's role in a given team, or null if not a member. */
export function getUserRole(user: AuthUser, teamId: string): string | null {
  const membership = user.memberships.find((m) => m.teamId === teamId);
  return membership ? membership.role : null;
}
