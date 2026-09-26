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
  profiles: { first_name: string; last_name: string; phone: string | null } | null;
  subscriptions: { start_date: string | null; end_date: string | null; package_id: string | null; packages: { id: string; name: string } } | null;
  promo_code_id: string | null;
  /** The code that was applied, via payments.promo_code_id */
  promo_codes: { code: string } | null;
  /** What that code took off, recorded at the time of payment. At most one row per payment. */
  promo_code_uses: { discount_amount: number }[] | null;
  /**
   * True for a 100%-discount subscription, which never produces a payment row.
   * These are assembled client-side from promo_code_uses so the giveaway is visible
   * in the list. They have no row in `payments`, so they cannot be selected, edited,
   * confirmed, rejected or deleted.
   */
  is_free_grant?: boolean;
}

export type SortField = "date" | "amount" | "status";
export type SortDir = "asc" | "desc";
