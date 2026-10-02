// How long a session runs, for paying coaches by the hour.

/** Rounds to 2 decimals; the epsilon stops 1.005 landing on 1.00 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Hours from `start` to `end` ("HH:MM" or "HH:MM:SS"). An end at or before the start runs
 * past midnight, so 22:00–00:00 is 2 hours. Same rule as the `session_length_hours` SQL
 * function that snapshots `coach_attendance.hours`.
 */
export function sessionHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return round2((endMinutes - startMinutes) / 60);
}
