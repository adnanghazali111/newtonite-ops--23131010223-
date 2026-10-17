type Status = "Open" | "InProgress" | "AwaitingApproval" | "Resolved" | "Closed";

interface StatusTransition {
  from: Status;
  to: Status;
  /** Roles allowed to perform this transition. */
  allowedRoles: string[];
  /** Optional extra guard evaluated at runtime. */
  guard?: (
    userId: string,
    item: { created_by: string; assignee_id: string | null },
  ) => { ok: boolean; reason?: string };
}

const VALID_TRANSITIONS: StatusTransition[] = [
  {
    from: "Open",
    to: "InProgress",
    allowedRoles: ["Member", "Lead", "Admin"],
  },
  {
    from: "InProgress",
    to: "AwaitingApproval",
    allowedRoles: ["Member", "Lead", "Admin"],
    guard: (userId, item) => {
      // Member can only submit for approval if they are the assignee
      // (Lead/Admin are always allowed — checked before this guard fires)
      if (item.assignee_id !== userId) {
        return {
          ok: false,
          reason:
            "Members can only submit for approval if they are the assignee",
        };
      }
      return { ok: true };
    },
  },
  {
    from: "AwaitingApproval",
    to: "Resolved",
    allowedRoles: ["Lead", "Admin"],
    guard: (userId, item) => {
      if (item.created_by === userId) {
        return { ok: false, reason: "Cannot approve your own item" };
      }
      return { ok: true };
    },
  },
  {
    from: "AwaitingApproval",
    to: "InProgress",
    allowedRoles: ["Lead", "Admin"],
  },
  {
    from: "Resolved",
    to: "Closed",
    allowedRoles: ["Member", "Lead", "Admin"],
    guard: (userId, item) => {
      // Member can only close if they are the creator
      if (item.created_by !== userId) {
        return {
          ok: false,
          reason: "Members can only close items they created",
        };
      }
      return { ok: true };
    },
  },
];

/**
 * Validate whether a status transition is allowed for a given user role.
 */
export function validateTransition(
  fromStatus: string,
  toStatus: string,
  userRole: string,
  userId: string,
  item: { created_by: string; assignee_id: string | null },
): { valid: boolean; reason?: string } {
  const transition = VALID_TRANSITIONS.find(
    (t) => t.from === fromStatus && t.to === toStatus,
  );

  if (!transition) {
    return {
      valid: false,
      reason: `Transition from '${fromStatus}' to '${toStatus}' is not allowed`,
    };
  }

  if (!transition.allowedRoles.includes(userRole)) {
    return {
      valid: false,
      reason: `Role '${userRole}' cannot transition from '${fromStatus}' to '${toStatus}'`,
    };
  }

  // Run guard if present — guards handle role-specific logic internally
  if (transition.guard) {
    // Lead/Admin skip member-only guards (InProgress->AwaitingApproval assignee check, Resolved->Closed creator check)
    const isMemberOnlyGuard =
      (fromStatus === "InProgress" && toStatus === "AwaitingApproval") ||
      (fromStatus === "Resolved" && toStatus === "Closed");

    const shouldRunGuard =
      userRole === "Member" || !isMemberOnlyGuard;

    if (shouldRunGuard) {
      const guardResult = transition.guard(userId, item);
      if (!guardResult.ok) {
        return { valid: false, reason: guardResult.reason };
      }
    }
  }

  return { valid: true };
}
