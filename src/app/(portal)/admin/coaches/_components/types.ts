export interface CoachRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  area: string | null;
  is_active: boolean;
  created_at: string;
}

export type SortField = "name" | "date";
export type SortDir = "asc" | "desc";
