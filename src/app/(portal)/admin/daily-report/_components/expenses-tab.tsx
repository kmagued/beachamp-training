"use client";

import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button } from "@/components/ui";
import { Receipt, Plus, Trash2 } from "lucide-react";
import { ExpenseDrawer } from "../../expenses/_components/expense-drawer";
import { deleteExpense } from "@/app/_actions/expenses";
import type { ExpenseRow, CategoryRow } from "../../expenses/_components/types";

export function ExpensesTab({ date }: { date: string }) {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function loadData() {
    setLoading(true);
    const [{ data: expenseData }, { data: categoryData }] = await Promise.all([
      supabase
        .from("expenses")
        .select("*, expense_categories(id, name, icon)")
        .eq("expense_date", date)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("expense_categories")
        .select("*")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name"),
    ]);
    setExpenses((expenseData || []) as unknown as ExpenseRow[]);
    setCategories((categoryData || []) as unknown as CategoryRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const total = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  function handleOpenNew() {
    setEditingExpense(null);
    setDrawerOpen(true);
  }

  function handleEdit(expense: ExpenseRow) {
    setEditingExpense(expense);
    setDrawerOpen(true);
  }

  async function handleDelete(id: string) {
    await deleteExpense(id);
    loadData();
  }

  if (loading) {
    return (
      <Card className="animate-pulse">
        <div className="h-5 w-32 bg-slate-200 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-full bg-slate-100 rounded" />
          <div className="h-4 w-full bg-slate-100 rounded" />
          <div className="h-4 w-2/3 bg-slate-100 rounded" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p>
          <p className="text-lg font-bold text-slate-900">{total.toLocaleString()} EGP</p>
        </div>
        <Button onClick={handleOpenNew}>
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Expense
          </span>
        </Button>
      </div>

      {/* List */}
      {expenses.length === 0 ? (
        <Card>
          <div className="text-center py-10">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">No expenses for this day</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Expense" to log one.</p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="divide-y divide-slate-100">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50 transition-colors cursor-pointer"
                onClick={() => handleEdit(expense)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{expense.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="neutral">{expense.expense_categories?.name}</Badge>
                    {expense.is_recurring && (
                      <Badge variant="info">{expense.recurrence_type}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                    {expense.amount.toLocaleString()} EGP
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <ExpenseDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditingExpense(null); }}
        categories={categories}
        editingExpense={editingExpense}
        onSuccess={() => { setDrawerOpen(false); setEditingExpense(null); loadData(); }}
        defaultDate={date}
      />
    </div>
  );
}
