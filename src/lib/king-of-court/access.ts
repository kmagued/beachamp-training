// Which groups a viewer gets as Leaderboard tabs. Admins see every group on the
// leaderboard; coaches the groups they coach; players the groups they belong to.

export interface GroupRow {
  id: string;
  name: string;
  level: string | null;
  is_active: boolean;
  /** Off for groups that don't play King of Court (e.g. Private Session) */
  in_leaderboard: boolean;
}

export interface LeaderboardGroup {
  id: string;
  name: string;
  level: string | null;
}

/** Groups on the leaderboard that this viewer may see. `allowedIds` null means every group (admins). */
export function groupsForViewer(groups: GroupRow[], allowedIds: ReadonlySet<string> | null): GroupRow[] {
  return groups.filter((g) => g.in_leaderboard && (allowedIds === null || allowedIds.has(g.id)));
}

/** The month's tabs: active groups, plus inactive ones that still have scores that month */
export function groupsToShow(groups: GroupRow[], scoredIds: ReadonlySet<string>): LeaderboardGroup[] {
  return groups
    .filter((g) => g.is_active || scoredIds.has(g.id))
    .map(({ id, name, level }) => ({ id, name, level }));
}

/** The tab to open: the one asked for if it is shown, else the first group with scores, else the first */
export function openingGroup(
  groupIds: string[],
  scoredIds: ReadonlySet<string>,
  requested: string | null
): string | null {
  if (requested && groupIds.includes(requested)) return requested;
  return groupIds.find((id) => scoredIds.has(id)) ?? groupIds[0] ?? null;
}

/**
 * Why a session can't take King of Court scores, or null if it can: only group sessions
 * whose group is on the leaderboard play it. The save action refuses with this message,
 * and the session page shows its Scores tab only when it's null.
 */
export function scoringProblem(
  session: { session_type: string | null; group_id: string | null; in_leaderboard: boolean | null | undefined } | null
): string | null {
  if (!session || session.session_type !== "group" || !session.group_id) {
    return "Scores can only be logged for group sessions";
  }
  if (session.in_leaderboard === false) return "This group isn't on the leaderboard, so it has no scores";
  return null;
}
