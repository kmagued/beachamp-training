// Spotting a payment an admin is about to record twice: the same player, package and amount
// already recorded that Cairo day. One private session's payment was once entered 8 times
// a few seconds apart.

import { cairoDayKey } from "@/lib/utils/cairo-time";

export interface RecordedPayment {
  amount: number;
  package_id: string | null;
  created_at: string;
}

/** The most recent payment for the same package and amount recorded the same Cairo day as
 *  `now`, or null */
export function sameDayDuplicate<T extends RecordedPayment>(
  recorded: T[],
  candidate: { amount: number; package_id: string },
  now: Date
): T | null {
  const today = cairoDayKey(now);
  const matches = recorded.filter(
    (p) =>
      p.package_id === candidate.package_id &&
      Number(p.amount) === candidate.amount &&
      cairoDayKey(new Date(p.created_at)) === today
  );
  matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return matches[0] ?? null;
}

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "00:52": the time of day in Cairo */
export function cairoTimeLabel(iso: string): string {
  return timeFmt.format(new Date(iso));
}
