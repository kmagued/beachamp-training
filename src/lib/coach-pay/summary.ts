// A coach's month from their attendance: days worked, hours paid, and what that comes to.

import { round2, sessionHours } from "./hours";

export type PayType = "hourly" | "daily";
export type CoachAttendanceStatus = "present" | "absent" | "excused";

/** One `coach_attendance` row with the session details the pay sheet shows */
export interface CoachAttendanceRow {
  /** YYYY-MM-DD */
  date: string;
  status: CoachAttendanceStatus;
  /** Session length snapshotted when the attendance was first saved */
  hours: number | null;
  /** HH:MM */
  startTime: string;
  /** HH:MM */
  endTime: string;
  /** Group name, or "Private – {player}" */
  sessionLabel: string;
  location: string | null;
  notes: string | null;
}

export interface MonthSummary {
  /** Distinct dates with at least one present session */
  days: number;
  hours: number;
}

/** Only sessions the coach was present for are paid */
export function paidHours(row: CoachAttendanceRow): number {
  if (row.status !== "present") return 0;
  return row.hours ?? sessionHours(row.startTime, row.endTime);
}

export function summarize(rows: CoachAttendanceRow[]): MonthSummary {
  const days = new Set<string>();
  let hours = 0;
  for (const r of rows) {
    if (r.status !== "present") continue;
    days.add(r.date);
    hours += paidHours(r);
  }
  return { days: days.size, hours: round2(hours) };
}

/** null when there is no rate yet, so a missing rate never reads as an unpaid month */
export function payTotal(type: PayType, rate: number | null, summary: MonthSummary): number | null {
  if (rate === null) return null;
  return round2((type === "hourly" ? summary.hours : summary.days) * rate);
}

/** The sum of the coaches' totals; null when no coach has a rate, so it can't pass for a real 0 */
export function grandTotal(totals: (number | null)[]): number | null {
  const known = totals.filter((t): t is number => t !== null);
  return known.length > 0 ? round2(known.reduce((sum, t) => sum + t, 0)) : null;
}

/** The rate box's text as a rate; blank, negative or non-numeric is no rate */
export function parseRate(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
