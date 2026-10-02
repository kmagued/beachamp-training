// A player's attendance streak for the dashboard, by the same rules as the streak badge
// (badge_measure() in the migration): present adds one, absent ends the run, excused is
// skipped, and an unmarked session has no row so it can't break the run. Unlike a
// badge, this counts all of the player's attendance, not just since a badge was added.

export type MarkStatus = "present" | "absent" | "excused";

export interface AttendanceMark {
  session_date: string;
  session_time: string | null;
  created_at: string;
  status: MarkStatus;
}

export interface StreakSummary {
  /** The run as it stands now */
  current: number;
  /** The longest run */
  best: number;
  /** The last few marks, oldest first, for the dots */
  recent: MarkStatus[];
}

/** Date order, then session time with untimed sessions last, then when entered: as the badge orders them */
function byWhen(a: AttendanceMark, b: AttendanceMark): number {
  if (a.session_date !== b.session_date) return a.session_date < b.session_date ? -1 : 1;
  if (a.session_time !== b.session_time) {
    if (a.session_time === null) return 1;
    if (b.session_time === null) return -1;
    return a.session_time < b.session_time ? -1 : 1;
  }
  return a.created_at.localeCompare(b.created_at);
}

export function attendanceStreak(marks: AttendanceMark[], recentCount = 8): StreakSummary {
  const ordered = [...marks].sort(byWhen);
  let current = 0;
  let best = 0;
  for (const mark of ordered) {
    if (mark.status === "present") {
      current += 1;
      best = Math.max(best, current);
    } else if (mark.status === "absent") {
      current = 0;
    }
  }
  return { current, best, recent: ordered.slice(-recentCount).map((m) => m.status) };
}

/** A line of encouragement for wherever the player is */
export function streakMessage(current: number, best: number): string {
  if (current === 0) {
    return best === 0
      ? "Attend your next session to start a streak."
      : `Your best is ${best} in a row. Start a new streak at your next session.`;
  }
  if (current < best) return `${best - current} more to beat your best of ${best}.`;
  return current === 1 ? "You're on your way. Keep it going!" : "Your best ever. Keep it going!";
}
