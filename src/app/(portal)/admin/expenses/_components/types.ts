export interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  is_recurring: boolean;
  recurrence_type: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  category_id: string;
  court_count: number | null;
  court_hours: number | null;
  court_hourly_rate: number | null;
  payment_status: "paid_full" | "partially_paid" | "payment_due";
  paid_amount: number | null;
  due_date: string | null;
  expense_categories: { id: string; name: string; icon: string | null };
}

export interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface IncomeRow {
  id: string;
  description: string | null;
  amount: number;
  income_date: string;
  is_active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  category_id: string;
  income_categories: { id: string; name: string; icon: string | null };
}

export type SortField = "date" | "amount" | "category";
export type SortDir = "asc" | "desc";
/** Expenses and income are the two sides the Finances page treats equally */
export type EntryKind = "expense" | "income";
export type ExpenseTab = "expenses" | "income" | "by-category" | "categories";
