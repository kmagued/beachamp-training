import type { UserRole } from "@/types/database";

export interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  area: string | null;
  role: UserRole;
  is_active: boolean;
  is_coach: boolean;
  created_at: string;
}

export type SortField = "name" | "role" | "date";
export type SortDir = "asc" | "desc";
