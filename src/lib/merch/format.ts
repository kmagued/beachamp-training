// Number and date formatting for the merch Analytics page.

import type { DateRange } from "./analytics";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function egp(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} EGP`;
}

/** A fraction (0.47) as a whole percent; tiny non-zero shares show as "<1%" rather than "0%" */
export function formatShare(fraction: number): string {
  const pct = fraction * 100;
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

export type DeltaDirection = "up" | "down" | "flat" | "none";

/** A change vs the previous period (from `delta`), e.g. "▲ 18%" */
export function formatDelta(delta: number | null): { text: string; direction: DeltaDirection } {
  if (delta === null) return { text: "—", direction: "none" };
  const pct = Math.round(Math.abs(delta) * 100);
  if (pct === 0) return { text: "0%", direction: "flat" };
  return delta > 0 ? { text: `▲ ${pct}%`, direction: "up" } : { text: `▼ ${pct}%`, direction: "down" };
}

function day(date: string, withYear: boolean) {
  const [y, m, d] = date.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${d}, ${y}` : `${MONTHS[m - 1]} ${d}`;
}

/** "Mar 28 – Jun 27, 2026", or "Dec 20, 2025 – Jan 5, 2026" across a year */
export function formatRange(range: DateRange): string {
  if (range.from === range.to) return day(range.from, true);
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${day(range.from, !sameYear)} – ${day(range.to, true)}`;
}
