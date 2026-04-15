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
