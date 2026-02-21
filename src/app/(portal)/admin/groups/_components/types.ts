export interface GroupData {
  id: string;
  name: string;
  description: string | null;
  level: string;
  max_players: number;
  is_active: boolean;
  player_count: number;
  coaches: { id: string; first_name: string; last_name: string; is_primary: boolean }[];
  schedule: { day_of_week: number; start_time: string; end_time: string }[];
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function getLevelVariant(level: string): "success" | "warning" | "danger" | "info" {
  switch (level) {
    case "beginner": return "success";
    case "intermediate": return "warning";
    case "advanced": return "danger";
    default: return "info";
  }
}
