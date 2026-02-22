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
  subscriptions: {
    status: string;
    sessions_remaining: number;
    sessions_total: number;
    start_date: string | null;
    end_date: string | null;
    packages: { name: string } | null;
  }[];
}

export type SortField = "name" | "date" | "level" | "package";
export type SortDir = "asc" | "desc";

export function getPlayerStatus(player: PlayerRow): string {
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

    // Time-based calculations
    let daysLeft: number | null = null;
    let packageDays = 30; // fallback if no start_date
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

    // Completed: all sessions used up
    if (sessions_remaining <= 0) return "completed";

    // Expiring: <= 7 days left
    if (daysLeft !== null && daysLeft <= 7) return "expiring";

    // Expiring soon: <= 30% of package time remaining OR <= 30% of sessions remaining
    if (timeRatio <= 0.3 || sessionsRatio <= 0.3) return "expiring soon";

    return "active";
  }
  const expiredSub = player.subscriptions?.find((s) => s.status === "expired");
  if (expiredSub) return "expired";
  const pendingSub = player.subscriptions?.find((s) => s.status === "pending");
  if (pendingSub) return "pending";
  return "inactive";
}
