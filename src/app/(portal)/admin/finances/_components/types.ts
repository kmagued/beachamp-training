import type { MerchStockLevel } from "@/lib/config/merch";

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
  /** Income categories only: catalog items show as sub-categories */
  is_merch?: boolean;
  created_at: string;
}

/** Merch catalog item offered as a sub-category of the Merch income category */
export interface MerchOption {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  subcategory_id: string | null;
  subcategory_name: string | null;
  price: number;
  is_active: boolean;
  /** Deleted from the catalog; kept so past income can still show it */
  deleted_at: string | null;
  /** Units on hand per size, in size order */
  stock: MerchStockLevel[];
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
  merch_item_id: string | null;
  merch_quantity: number | null;
  merch_size: string | null;
  income_categories: { id: string; name: string; icon: string | null };
  merch_items: {
    id: string;
    name: string;
    category_id: string;
    merch_categories: { name: string } | null;
    merch_subcategories: { name: string } | null;
  } | null;
}

export type SortField = "date" | "amount" | "category";
export type SortDir = "asc" | "desc";
/** Expenses and income are the two sides the Finances page treats equally */
export type EntryKind = "expense" | "income";
export type ExpenseTab = "payments" | "expenses" | "income" | "by-category" | "categories";
