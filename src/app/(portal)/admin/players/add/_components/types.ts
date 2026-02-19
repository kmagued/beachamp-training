import type { PaymentMethod } from "@/types/database";

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
  phone: string;
  package_name: string;
  start_date: string;
  end_date: string;
  sessions_remaining: number;
  sessions_total: number;
  amount: number;
  method: PaymentMethod;
}

export interface BulkPlayerResult {
  name: string;
  email: string;
  status: "success" | "error";
  password?: string;
  error?: string;
}
