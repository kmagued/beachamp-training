/** Rules for admin-editable subscription expiry dates. Shared by the player
 *  detail page and the players-list drawer so the two can't drift apart. */

import { cairoToday } from "@/lib/utils/cairo-time";

/** Whether `end_date` (YYYY-MM-DD) is in the past as of the given Cairo day —
 *  i.e. the subscription can no longer be used.
 *
 *  end_date is a DATE column holding a Cairo calendar day, and a subscription
 *  is usable through the whole of its last day. The old idiom for this,
 *  `new Date(end_date).getTime() < Date.now()`, got both halves wrong: it
 *  parses the bare date as UTC midnight and compares it to an instant, so a
 *  subscription expiring today read as expired from 02:00–03:00 Cairo onward.
 *  In the attendance flow that turned a paid-up player into a zero-balance one
 *  and raised a pending payment against them.
 *
 *  Compared as strings — ISO dates order correctly and no timezone is applied
 *  to either side. */
export function hasLapsed(
  endDate: string | null | undefined,
  onDate: string = cairoToday()
): boolean {
  return !!endDate && endDate < onDate;
}

/** Whether an admin may move this subscription's expiry date.
 *
 *  Excluded:
 *  - subs with no end_date — nothing to move
 *  - single-session subs — they have no expiry concept and end on use
 *  - subs awaiting payment confirmation — confirming re-derives the dates from
 *    the package validity, which would silently discard the edit
 *
 *  Structurally typed so both the detail page's SubscriptionRow and the
 *  drawer's inline subscription type satisfy it. */
export function canEditEndDate(sub: {
  end_date: string | null;
  sessions_total: number;
  status: string;
}): boolean {
  return (
    !!sub.end_date &&
    sub.sessions_total > 1 &&
    sub.status !== "pending" &&
    sub.status !== "pending_payment"
  );
}
