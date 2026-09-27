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
