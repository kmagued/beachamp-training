import { hasLapsed } from "@/lib/subscriptions/expiry";

export interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  area: string | null;
  playing_level: string | null;
  training_goals: string | null;
  health_conditions: string | null;
  height: number | null;
  weight: number | null;
  preferred_hand: string | null;
  preferred_position: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  gender: string | null;
  occupation: string | null;
  is_active: boolean;
  is_currently_active: boolean;
  created_at: string;
  last_attended: string | null;
  groups: { id: string; name: string }[];
  subscriptions: {
    id: string;
    status: string;
    sessions_remaining: number;
    sessions_total: number;
    start_date: string | null;
    end_date: string | null;
    packages: { name: string } | null;
  }[];
}

export type ActivityStatus = "active" | "inactive";
export type SubscriptionStatus =
  | "active"
  | "expiring soon"
  | "expired"
  | "attended"
  | "pending"
  | "pending_payment"
  | "frozen"
  | "none";

export type SortField = "name" | "date" | "level" | "group" | "package" | "sessions" | "expires" | "subscription" | "activity";
export type SortDir = "asc" | "desc";

/** Check if a subscription is effectively active (not expired by sessions or date). */
export function isEffectivelyActive(s: { status: string; sessions_remaining: number; sessions_total: number; end_date: string | null }) {
  if (s.status !== "active" && s.status !== "pending") return false;
  if (s.sessions_remaining <= 0) return false;
  if (hasLapsed(s.end_date)) return false;
  return true;
}

/** A multi-session subscription that has run out — by date or by balance —
 *  while still stored as 'active'.
 *
 *  Nothing in the system flips `status` to 'expired' when `end_date` passes or
 *  the last session is used: the only auto-expiry is the attendance trigger for
 *  single-session packages. So "expired" has to be derived here, or a lapsed
 *  player falls through to "No Sub" and the Expired filter misses them.
 *
 *  Narrow on purpose, because it only breaks the tie for players who would
 *  otherwise read as "No Sub":
 *  - 'active' only — a 'pending' sub has no dates until payment is confirmed
 *  - multi-session only — a single-session package has no expiry concept and is
 *    expired on use by the attendance trigger, which reads as "attended" */
export function hasRunOut(s: { status: string; sessions_remaining: number; sessions_total: number; end_date: string | null }) {
  return (
    s.status === "active" &&
    s.sessions_total > 1 &&
    (s.sessions_remaining <= 0 || hasLapsed(s.end_date))
  );
}

/** Pick the most recent subscription (by start_date, falling back to end_date). */
export function getLatestSubscription(player: PlayerRow) {
  if (!player.subscriptions?.length) return null;
  return [...player.subscriptions].sort((a, b) => {
    const aDate = a.start_date || a.end_date || "";
    const bDate = b.start_date || b.end_date || "";
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  })[0];
}

/** Player is active if they trained in the last 30 days OR have a valid subscription.
 *  Predicate is computed by the `players_with_status` Postgres view. */
export function getActivityStatus(player: PlayerRow): ActivityStatus {
  return player.is_currently_active ? "active" : "inactive";
}

/** Subscription-only status — independent of player activity. */
export function getSubscriptionStatus(player: PlayerRow): SubscriptionStatus {
  const now = Date.now();
  // Only confirmed subscriptions count as active. A 'pending' one has no dates until
  // payment is confirmed, so an open-ended date check would otherwise pass it as active.
  const activeSubs = player.subscriptions?.filter((s) => s.status === "active" && isEffectivelyActive(s)) || [];

  // Prefer the subscription covering today; if none, pick the nearest upcoming one
  const activeSub =
    activeSubs.find((s) => {
      const start = s.start_date ? new Date(s.start_date).getTime() : 0;
      const end = s.end_date ? new Date(s.end_date).getTime() : Infinity;
      return start <= now && now <= end;
    }) ||
    activeSubs
      .filter((s) => s.start_date && new Date(s.start_date).getTime() > now)
      .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime())[0] ||
    activeSubs[0] || null;

  if (activeSub) {
    const { sessions_remaining, sessions_total, end_date } = activeSub;
    const isSingleSession = sessions_total === 1;

    // Single-session: no expiry concept, just attended or active
    if (isSingleSession) {
      if (sessions_remaining <= 0) return "attended";
      return "active";
    }

    // Time-based calculations
    let daysLeft: number | null = null;
    if (end_date) {
      daysLeft = Math.ceil(
        (new Date(end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
    }

    if (daysLeft !== null && daysLeft <= 0) return "expired";

    const sessionsRatio = sessions_total > 0 ? sessions_remaining / sessions_total : 1;

    if (sessions_remaining <= 0) return "expired";
    if (daysLeft !== null && daysLeft <= 10) return "expiring soon";
    if (sessionsRatio <= 0.3) return "expiring soon";

    return "active";
  }

  // A usable subscription awaiting payment confirmation outranks older frozen/expired ones
  if (player.subscriptions?.some((s) => s.status === "pending" && isEffectivelyActive(s))) return "pending";

  // Check for frozen subscription
  const frozenSub = player.subscriptions?.find((s) => s.status === "frozen");
  if (frozenSub) return "frozen";

  // No active subscription
  const expiredSub = player.subscriptions?.find((s) => s.status === "expired");
  if (expiredSub) {
    // Single-session packages never "expire" — they're just attended
    if (expiredSub.sessions_total === 1) return "attended";
    return "expired";
  }
  const pendingPaymentSub = player.subscriptions?.find((s) => s.status === "pending_payment");
  if (pendingPaymentSub) return "pending_payment";
  const pendingSub = player.subscriptions?.find((s) => s.status === "pending");
  if (pendingSub) return "pending";
  // Last resort, so no other status is displaced: a subscription that lapsed
  // without the database ever recording it. See hasRunOut.
  if (player.subscriptions?.some(hasRunOut)) return "expired";
  return "none";
}
