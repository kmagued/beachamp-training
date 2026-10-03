// The order players are listed in while attendance is logged, the same in the Daily Report
// and on a coach's session page.

export interface AttendanceListEntry {
  name: string;
  /** Attendance already saved for this session, as last loaded or saved */
  saved: boolean;
  /** Has a subscription this session can be charged to */
  canBeCharged: boolean;
}

/**
 * Already-saved attendance first, then players who can be charged, then by name.
 * `saved` must be the last loaded or saved state, never the live taps: sorting on taps
 * made a row jump to the top the moment it was logged, which read as the list scrolling
 * away under the coach.
 */
export function attendanceOrder<T>(players: T[], entry: (player: T) => AttendanceListEntry): T[] {
  return players
    .map((player) => ({ player, e: entry(player) }))
    .sort((a, b) => {
      if (a.e.saved !== b.e.saved) return a.e.saved ? -1 : 1;
      if (a.e.canBeCharged !== b.e.canBeCharged) return a.e.canBeCharged ? -1 : 1;
      return a.e.name.localeCompare(b.e.name);
    })
    .map(({ player }) => player);
}
