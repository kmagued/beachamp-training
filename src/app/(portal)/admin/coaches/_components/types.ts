export interface CoachRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  area: string | null;
  is_active: boolean;
  created_at: string;
  group_count: number;
  group_names: string[];
  /** A player who coaches (role 'player', is_coach): removing coach access keeps their account */
  is_player: boolean;
}

export type SortField = "name" | "date";
export type SortDir = "asc" | "desc";
