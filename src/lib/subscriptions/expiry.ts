/** Rules for admin-editable subscription expiry dates. Shared by the player
 *  detail page and the players-list drawer so the two can't drift apart. */

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
