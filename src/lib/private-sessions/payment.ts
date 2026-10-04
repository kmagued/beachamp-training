// Paying for a private session: who pays, which package and where the payment stands.
// A private session is a schedule_sessions row (session_type 'private'). Its player_id is
// the player who pays: the one who requested it, or the first player an admin added.

import { formatDay, formatTime } from "@/lib/king-of-court/format";
import { egp } from "@/lib/merch/format";

export type PaymentState = "unpaid" | "pending" | "paid";

const PAID = ["active", "expired", "frozen"];
const UNDER_REVIEW = ["pending", "pending_payment"];

/** Where a session's payment stands, from the statuses of the subscriptions linked to it.
 *  Rejecting a payment cancels its subscription, which then no longer counts. */
export function paymentState(linkedStatuses: string[]): PaymentState {
  if (linkedStatuses.some((s) => PAID.includes(s))) return "paid";
  if (linkedStatuses.some((s) => UNDER_REVIEW.includes(s))) return "pending";
  return "unpaid";
}

/** The private package for a session with this many players, or null (three or more) */
export function privatePackageFor<T extends { private_session_players: number | null }>(
  playerCount: number,
  packages: T[]
): T | null {
  return packages.find((p) => p.private_session_players === playerCount) ?? null;
}

/** Is this player charged for attending? On a private session only its payer is; on a
 *  group session, or a private one with no payer, everyone is. */
export function isChargedOnSession(
  session: { session_type: string; player_id: string | null },
  playerId: string
): boolean {
  return session.session_type !== "private" || !session.player_id || session.player_id === playerId;
}

/** The player's plan: the newest of these (newest first) that isn't a private session's
 *  payment. A row read from a database that doesn't have private_session_id yet is a plan. */
export function newestPlanSubscription<T extends { private_session_id?: string | null }>(subs: T[]): T | null {
  return subs.find((s) => !s.private_session_id) ?? null;
}

/** Is this a payment held for another private session that's still on the schedule
 *  (`scheduledPrivateIds`)? Such a payment is only used at its own session; once that
 *  session is deleted it's an ordinary single session again. */
export function heldForAnotherSession(
  sub: { private_session_id?: string | null },
  sessionId: string,
  scheduledPrivateIds: Set<string>
): boolean {
  return !!sub.private_session_id && sub.private_session_id !== sessionId && scheduledPrivateIds.has(sub.private_session_id);
}

export const ALREADY_PAID = "This session is already paid or under review";

/** Why this player can't pay for this private session with this package, or null */
export function privatePaymentProblem(input: {
  callerId: string;
  session: { session_type: string; is_active: boolean; player_id: string | null } | null;
  playerCount: number;
  packagePlayers: number | null;
  hasLivePayment: boolean;
}): string | null {
  const { session } = input;
  if (!session || session.session_type !== "private" || !session.is_active) {
    return "This private session no longer exists";
  }
  if (session.player_id !== input.callerId) return "Only the player who booked this session can pay for it";
  if (input.packagePlayers !== input.playerCount) return "This package doesn't match the session";
  if (input.hasLivePayment) return ALREADY_PAID;
  return null;
}

/** "Sat 10 Oct at 8:00 PM" */
export function sessionWhen(date: string, time: string): string {
  return `${formatDay(date)} at ${formatTime(time)}`;
}

/** What the payer is told when their session is confirmed */
export function paymentPrompt(when: string, price: number): string {
  return `Your private session on ${when} is confirmed. You can pay ${egp(price)} from your dashboard.`;
}
