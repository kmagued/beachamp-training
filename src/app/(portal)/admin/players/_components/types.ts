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
  is_active: boolean;
  created_at: string;
  last_attended: string | null;
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
  | "expiring"
  | "expired"
  | "completed"
  | "attended"
  | "pending"
  | "none";

export type SortField = "name" | "date" | "level" | "package" | "sessions" | "expires" | "subscription";
export type SortDir = "asc" | "desc";

/** Pick the most recent subscription (by start_date, falling back to end_date). */
export function getLatestSubscription(player: PlayerRow) {
  if (!player.subscriptions?.length) return null;
  return [...player.subscriptions].sort((a, b) => {
    const aDate = a.start_date || a.end_date || "";
    const bDate = b.start_date || b.end_date || "";
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  })[0];
}

/** Player is active if they have an active subscription OR trained in last 2 weeks. */
export function getActivityStatus(player: PlayerRow): ActivityStatus {
  const now = Date.now();
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  const recentlyTrained = !!player.last_attended &&
    (now - new Date(player.last_attended).getTime()) <= twoWeeksMs;
  const hasActiveSub = player.subscriptions?.some((s) => s.status === "active") || false;

  if (hasActiveSub || recentlyTrained) return "active";
  return "inactive";
}

/** Subscription-only status — independent of player activity. */
export function getSubscriptionStatus(player: PlayerRow): SubscriptionStatus {
  const now = Date.now();
  const activeSubs = player.subscriptions?.filter((s) => s.status === "active") || [];

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
    const { sessions_remaining, sessions_total, start_date, end_date } = activeSub;
    const isSingleSession = sessions_total === 1;

    // Single-session: no expiry concept, just attended or active
    if (isSingleSession) {
      if (sessions_remaining <= 0) return "attended";
      return "active";
    }

    // Time-based calculations
    let daysLeft: number | null = null;
    let packageDays = 30;
    if (end_date) {
      daysLeft = Math.ceil(
        (new Date(end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (start_date) {
        packageDays = Math.max(1, Math.ceil(
          (new Date(end_date).getTime() - new Date(start_date).getTime()) / (1000 * 60 * 60 * 24)
        ));
      }
    }

    if (daysLeft !== null && daysLeft <= 0) return "expired";

    const timeRatio = daysLeft !== null ? daysLeft / packageDays : 1;
    const sessionsRatio = sessions_total > 0 ? sessions_remaining / sessions_total : 1;

    if (sessions_remaining <= 0) return "completed";
    if (daysLeft !== null && daysLeft <= 7) return "expiring";
    if (timeRatio <= 0.3 || sessionsRatio <= 0.3) return "expiring soon";

    return "active";
  }

  // No active subscription
  const expiredSub = player.subscriptions?.find((s) => s.status === "expired");
  if (expiredSub) {
    // Single-session packages never "expire" — they're just attended
    if (expiredSub.sessions_total === 1) return "attended";
    return "expired";
  }
  const pendingSub = player.subscriptions?.find((s) => s.status === "pending");
  if (pendingSub) return "pending";
  return "none";
}
