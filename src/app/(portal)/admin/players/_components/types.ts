export interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  playing_level: string | null;
  created_at: string;
  subscriptions: {
    status: string;
    sessions_remaining: number;
    sessions_total: number;
    end_date: string | null;
    packages: { name: string } | null;
  }[];
}

export type SortField = "date" | "level" | "package";
export type SortDir = "asc" | "desc";

export function getPlayerStatus(player: PlayerRow): string {
  const activeSub = player.subscriptions?.find((s) => s.status === "active");
  if (activeSub) {
    if (activeSub.end_date) {
      const daysLeft = Math.ceil(
        (new Date(activeSub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft <= 7) return "expiring";
    }
    return "active";
  }
  const pendingSub = player.subscriptions?.find((s) => s.status === "pending");
  if (pendingSub) return "pending";
  return "inactive";
}
