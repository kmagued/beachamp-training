"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { StatCard, Pagination, Button } from "@/components/ui";
import { Receipt, Repeat, CalendarDays, Tag, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { deleteExpense } from "@/app/_actions/expenses";
import type { ExpenseRow, CategoryRow, SortField, SortDir, ExpenseTab } from "./_components/types";
import { ExpensesPageSkeleton } from "./_components/skeleton";
import { ExpensesFilters } from "./_components/filters";
import { ExpensesTableView } from "./_components/table";
import { ExpenseDrawer } from "./_components/expense-drawer";
import { CategoryDrawer } from "./_components/category-drawer";

export default function AdminExpensesPage() {
  return (
    <Suspense fallback={<ExpensesPageSkeleton />}>
      <AdminExpensesContent />
    </Suspense>
  );
}

const TABS: { key: ExpenseTab; label: string }[] = [
  { key: "all", label: "All Expenses" },
  { key: "one-time", label: "One-time" },
  { key: "recurring", label: "Recurring" },
  { key: "categories", label: "Categories" },
];

function AdminExpensesContent() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<ExpenseTab>("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Drawer state
  const [expenseDrawerOpen, setExpenseDrawerOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchData = useCallback(async () => {
    const [{ data: expenseData }, { data: categoryData }] = await Promise.all([
      supabase
        .from("expenses")
        .select("*, expense_categories(id, name, icon)")
        .eq("is_active", true)
        .order("expense_date", { ascending: false }),
      supabase
        .from("expense_categories")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
    ]);

    if (expenseData) setExpenses(expenseData as unknown as ExpenseRow[]);
    if (categoryData) setCategories(categoryData as unknown as CategoryRow[]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Monthly calculations
  const { totalThisMonth, recurringMonthly, oneTimeThisMonth } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const oneTime = expenses
      .filter((e) => !e.is_recurring)
      .filter((e) => {
        const d = new Date(e.expense_date);
        return d >= monthStart && d <= monthEnd;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const recurringM = expenses
      .filter((e) => e.is_recurring && e.recurrence_type === "monthly")
      .reduce((sum, e) => sum + e.amount, 0);

    const recurringW = expenses
      .filter((e) => e.is_recurring && e.recurrence_type === "weekly")
      .reduce((sum, e) => sum + e.amount * 4, 0);

    return {
      totalThisMonth: oneTime + recurringM + recurringW,
      recurringMonthly: recurringM + recurringW,
      oneTimeThisMonth: oneTime,
    };
  }, [expenses]);

  const activeCategoryCount = categories.filter((c) => c.is_active).length;

  // Derive filter options
  const categoryOptions = useMemo(() => {
    const names = new Set<string>();
    expenses.forEach((e) => {
      if (e.expense_categories?.name) names.add(e.expense_categories.name);
    });
    return [...names].sort();
  }, [expenses]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    expenses.forEach((e) => {
      const d = new Date(e.expense_date);
      months.add(d.toLocaleDateString("en-US", { year: "numeric", month: "long" }));
    });
    return [...months];
  }, [expenses]);

  // Apply tab + filters + sort
  const filteredExpenses = useMemo(() => {
    let result = expenses;

    // Tab filter
    if (tab === "one-time") result = result.filter((e) => !e.is_recurring);
    if (tab === "recurring") result = result.filter((e) => e.is_recurring);

    // Type filter (when on "all" tab)
    if (typeFilter === "one-time") result = result.filter((e) => !e.is_recurring);
    if (typeFilter === "recurring") result = result.filter((e) => e.is_recurring);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.description.toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q)
      );
    }

    if (monthFilter) {
      result = result.filter((e) => {
        const d = new Date(e.expense_date);
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long" }) === monthFilter;
      });
    }

    if (categoryFilter) {
      result = result.filter((e) => e.expense_categories?.name === categoryFilter);
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime();
      } else if (sortField === "amount") {
        cmp = a.amount - b.amount;
      } else if (sortField === "category") {
        cmp = (a.expense_categories?.name || "").localeCompare(b.expense_categories?.name || "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [expenses, tab, typeFilter, search, monthFilter, categoryFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredExpenses.length / PAGE_SIZE);
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, monthFilter, categoryFilter, typeFilter, tab]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleEdit(expense: ExpenseRow) {
    setEditingExpense(expense);
    setExpenseDrawerOpen(true);
  }

  function handleDelete(id: string) {
    setDeletingId(id);
  }

  async function confirmDelete() {
    if (!deletingId) return;
    await deleteExpense(deletingId);
    setDeletingId(null);
    fetchData();
  }

  function resetFilters() {
    setSearch("");
    setMonthFilter("");
    setCategoryFilter("");
    setTypeFilter("");
  }

  const hasActiveFilters = !!search || !!monthFilter || !!categoryFilter || !!typeFilter;
  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-slate-500 text-sm">
            Track court reservations, salaries, and other costs
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setCategoryDrawerOpen(true)}
            className="hidden sm:inline-flex"
          >
            <Settings className="w-4 h-4 mr-1.5" />
            Categories
          </Button>
          <Button onClick={() => { setEditingExpense(null); setExpenseDrawerOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label={`Total (${currentMonth})`}
          value={`${totalThisMonth.toLocaleString()} EGP`}
          accentColor="bg-red-500"
          icon={<Receipt className="w-5 h-5" />}
        />
        <StatCard
          label="Recurring / Month"
          value={`${recurringMonthly.toLocaleString()} EGP`}
          accentColor="bg-amber-500"
          icon={<Repeat className="w-5 h-5" />}
        />
        <StatCard
          label={`One-time (${currentMonth})`}
          value={`${oneTimeThisMonth.toLocaleString()} EGP`}
          accentColor="bg-primary"
          icon={<CalendarDays className="w-5 h-5" />}
        />
        <StatCard
          label="Categories"
          value={activeCategoryCount}
          accentColor="bg-slate-400"
          icon={<Tag className="w-5 h-5" />}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
              tab === t.key
                ? "bg-primary-50 text-primary-700"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            )}
          >
            {t.label}
          </button>
        ))}
        {/* Mobile categories button */}
        <button
          onClick={() => setCategoryDrawerOpen(true)}
          className="sm:hidden px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          <Settings className="w-4 h-4 inline mr-1" />
          Manage
        </button>
      </div>

      {/* Categories tab content */}
      {tab === "categories" ? (
        <CategoriesView categories={categories} onManage={() => setCategoryDrawerOpen(true)} />
      ) : (
        <>
          {/* Filters */}
          <ExpensesFilters
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            categoryOptions={categoryOptions}
            monthFilter={monthFilter}
            onMonthFilterChange={setMonthFilter}
            monthOptions={monthOptions}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            onReset={resetFilters}
            hasActiveFilters={hasActiveFilters}
          />

          {/* Table */}
          <div className="flex-1">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-sm">Loading expenses...</div>
            ) : (
              <ExpensesTableView
                expenses={paginatedExpenses}
                sortField={sortField}
                sortDir={sortDir}
                toggleSort={toggleSort}
                onEdit={handleEdit}
                onDelete={handleDelete}
                search={search}
                typeFilter={typeFilter}
              />
            )}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {/* Expense drawer */}
      <ExpenseDrawer
        open={expenseDrawerOpen}
        onClose={() => {
          setExpenseDrawerOpen(false);
          setEditingExpense(null);
        }}
        categories={categories}
        editingExpense={editingExpense}
        onSuccess={fetchData}
      />

      {/* Category drawer */}
      <CategoryDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        categories={categories}
        onSuccess={fetchData}
      />

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeletingId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-slate-900 mb-2">Delete Expense</h3>
            <p className="text-sm text-slate-500 mb-4">
              Are you sure you want to delete this expense? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriesView({ categories, onManage }: { categories: CategoryRow[]; onManage: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {categories.length} categories ({categories.filter((c) => c.is_active).length} active)
        </p>
        <Button variant="outline" onClick={onManage}>
          <Settings className="w-4 h-4 mr-1.5" />
          Manage Categories
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={cn(
              "flex items-center gap-3 p-4 rounded-xl border transition-colors",
              cat.is_active
                ? "bg-white border-slate-200"
                : "bg-slate-50 border-slate-100 opacity-60"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium", cat.is_active ? "text-slate-900" : "text-slate-400 line-through")}>
                {cat.name}
              </p>
              <p className="text-xs text-slate-400">
                {cat.is_default ? "Default" : "Custom"} &middot; {cat.is_active ? "Active" : "Inactive"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
