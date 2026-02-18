export interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  status: string;
  screenshot_url: string | null;
  created_at: string;
  confirmed_at: string | null;
  profiles: { first_name: string; last_name: string } | null;
  subscriptions: { packages: { name: string } } | null;
}

export type SortField = "date" | "amount" | "status";
export type SortDir = "asc" | "desc";
