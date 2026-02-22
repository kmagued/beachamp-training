export interface PackageOption {
  id: string;
  name: string;
  session_count: number;
  price: number;
  validity_days: number;
}

export interface BulkPlayerRow {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  area?: string;
  height?: number | null;
  weight?: number | null;
  preferred_hand?: string;
  preferred_position?: string;
  health_conditions?: string;
  training_goals?: string;
  guardian_name?: string;
  guardian_phone?: string;
}

export interface BulkPlayerResult {
  name: string;
  email: string;
  status: "success" | "updated" | "error";
  password?: string;
  error?: string;
}
