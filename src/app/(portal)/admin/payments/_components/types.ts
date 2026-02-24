export interface PaymentRow {
  id: string;
  player_id: string | null;
  subscription_id: string | null;
  amount: number;
  method: string;
  status: string;
  screenshot_url: string | null;
  created_at: string;
  confirmed_at: string | null;
  rejection_reason: string | null;
  note: string | null;
  profiles: { first_name: string; last_name: string } | null;
  subscriptions: { start_date: string | null; end_date: string | null; packages: { name: string } } | null;
}

export type SortField = "date" | "amount" | "status";
export type SortDir = "asc" | "desc";
