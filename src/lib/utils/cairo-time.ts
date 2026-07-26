/** Africa/Cairo timezone helpers. The academy operates in Egypt, but the
 *  Next.js server runs in UTC on Vercel. Using server-local Date math
 *  silently shifts month boundaries by 2–3 hours, which makes the dashboard
 *  miss/overcount payments around midnight Cairo time. */

const CAIRO_TZ = "Africa/Cairo";

const monthKeyFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: CAIRO_TZ,
  year: "numeric",
  month: "2-digit",
});

const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAIRO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM in Africa/Cairo for the given date. */
export function cairoMonthKey(date: Date): string {
  const parts = monthKeyFmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** Current { year, month } (1-12) in Africa/Cairo. */
export function cairoNowYearMonth(): { year: number; month: number } {
  const [y, m] = cairoMonthKey(new Date()).split("-").map(Number);
  return { year: y, month: m };
}

/** Today's date as YYYY-MM-DD in Africa/Cairo. Use this instead of
 *  new Date().toISOString() when comparing against DATE columns such as
 *  subscriptions.end_date, which hold Cairo calendar days. */
export function cairoToday(): string {
  return dayKeyFmt.format(new Date());
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative when `to` is
 *  earlier. Parsed as UTC midnight on both sides so the offset cancels out and
 *  DST never shifts the count. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** `date` (YYYY-MM-DD) shifted by `days`, returned as YYYY-MM-DD. Calendar
 *  arithmetic only — no clock, so DST transitions can't drop or add an hour. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
