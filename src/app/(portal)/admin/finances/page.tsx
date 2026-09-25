"use client";

import { Suspense, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { StatCard, Pagination, Button, Toast, ConfirmDrawer, Badge } from "@/components/ui";
import { Receipt, Repeat, Plus, Settings, Download, TrendingUp, Scale } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format-date";
import { deleteExpense } from "@/app/_actions/expenses";
import { deleteIncome } from "@/app/_actions/income";
import type { ExpenseRow, CategoryRow, IncomeRow, SortField, SortDir, ExpenseTab, EntryKind } from "./_components/types";
import { ExpensesPageSkeleton } from "./_components/skeleton";
import { ExpensesFilters } from "./_components/filters";
import { ExpensesTableView } from "./_components/table";
import { EntryDrawer } from "./_components/entry-drawer";
import { CategoryDrawer } from "./_components/category-drawer";
import { CategoryReport, type ReportEntry } from "./_components/category-report";
import { IncomeTableView } from "./_components/income-table";
import { EntryTypeSwitch } from "./_components/entry-type-switch";
import { PaymentsView } from "@/app/(portal)/admin/payments/_components/payments-view";
import { cairoMonthKey } from "@/lib/utils/cairo-time";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export default function AdminExpensesPage() {
  return (
    <Suspense fallback={<ExpensesPageSkeleton />}>
      <AdminExpensesContent />
    </Suspense>
  );
}

interface PaymentIncomeRow {
  id: string;
  amount: number;
  confirmed_at: string | null;
  subscriptions: { packages: { name: string } | null } | null;
}

const TABS: { key: ExpenseTab; label: string }[] = [
  { key: "payments", label: "Payments" },
  { key: "expenses", label: "Expenses" },
  { key: "income", label: "Manual Income" },
  { key: "by-category", label: "By Category" },
  { key: "categories", label: "Categories" },
];

function AdminExpensesContent() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<CategoryRow[]>([]);
  // Subscription revenue. Confirmed only, bucketed by confirmed_at in Cairo time —
  // the same rule the dashboard uses, so the two pages agree.
  const [paymentIncome, setPaymentIncome] = useState<PaymentIncomeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<ExpenseTab>(
    TABS.some((t) => t.key === initialTab) ? (initialTab as ExpenseTab) : "payments"
  );
  const router = useRouter();
  const pathname = usePathname();

  /** Keep `?tab=` in step with the active tab so the page can be linked and reloaded. */
  const changeTab = useCallback((key: ExpenseTab) => {
    setTab(key);
    const params = new URLSearchParams(window.location.search);
    // Payments is the default tab, so it needs no param
    if (key === "payments") params.delete("tab");
    else params.set("tab", key);
    // Filters owned by the payments view are meaningless once we leave it
    if (key !== "payments") {
      for (const k of ["q", "statusFilter", "status", "package", "method", "type", "sort", "dir", "page", "size", "highlight"]) {
        params.delete(k);
      }
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [incomePage, setIncomePage] = useState(1);

  // Income tab keeps its own filters — the two sides share no categories or months
  const [incomeSearch, setIncomeSearch] = useState("");
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState("");
  const [incomeMonthFilter, setIncomeMonthFilter] = useState("");

  // Which side the "By Category" report is charting
  const [reportKind, setReportKind] = useState<EntryKind>("expense");

  // Drawer state
  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<EntryKind>("expense");
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [editingIncome, setEditingIncome] = useState<IncomeRow | null>(null);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [categoryDrawerKind, setCategoryDrawerKind] = useState<EntryKind>("expense");

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingIncomeId, setDeletingIncomeId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchData = useCallback(async () => {
    const [{ data: expenseData }, { data: categoryData }, { data: incomeData }, { data: incomeCategoryData }, { data: paymentData }] = await Promise.all([
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
      supabase
        .from("income")
        .select("*, income_categories(id, name, icon)")
        .eq("is_active", true)
        .order("income_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("income_categories")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("payments")
        .select("id, amount, confirmed_at, subscriptions(packages(name))")
        .eq("status", "confirmed"),
    ]);

    if (expenseData) setExpenses(expenseData as unknown as ExpenseRow[]);
    if (categoryData) setCategories(categoryData as unknown as CategoryRow[]);
    if (incomeData) setIncome(incomeData as unknown as IncomeRow[]);
    if (incomeCategoryData) setIncomeCategories(incomeCategoryData as unknown as CategoryRow[]);
    if (paymentData) setPaymentIncome(paymentData as unknown as PaymentIncomeRow[]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Monthly calculations
  const { totalThisMonth, recurringMonthly } = useMemo(() => {
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
    };
  }, [expenses]);

  const allTimeTotal = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  // Income calculations
  const { incomeThisMonth, incomeAllTime } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      incomeThisMonth: income
        .filter((i) => {
          const d = new Date(i.income_date);
          return d >= monthStart && d <= monthEnd;
        })
        .reduce((sum, i) => sum + i.amount, 0),
      incomeAllTime: income.reduce((sum, i) => sum + i.amount, 0),
    };
  }, [income]);

  // Subscription revenue, split the same way
  const { paymentsThisMonth, paymentsAllTime } = useMemo(() => {
    const currentKey = cairoMonthKey(new Date());
    let thisMonth = 0;
    let allTime = 0;
    for (const p of paymentIncome) {
      if (!p.confirmed_at) continue;
      allTime += p.amount;
      if (cairoMonthKey(new Date(p.confirmed_at)) === currentKey) thisMonth += p.amount;
    }
    return { paymentsThisMonth: thisMonth, paymentsAllTime: allTime };
  }, [paymentIncome]);

  // What the stat cards and Net show: manual income plus subscription revenue
  const totalIncomeThisMonth = incomeThisMonth + paymentsThisMonth;
  const totalIncomeAllTime = incomeAllTime + paymentsAllTime;

  const netThisMonth = totalIncomeThisMonth - totalThisMonth;
  const netAllTime = totalIncomeAllTime - allTimeTotal;

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

  const incomeCategoryOptions = useMemo(() => {
    const names = new Set<string>();
    income.forEach((i) => {
      if (i.income_categories?.name) names.add(i.income_categories.name);
    });
    return [...names].sort();
  }, [income]);

  const incomeMonthOptions = useMemo(() => {
    const months = new Set<string>();
    income.forEach((i) => {
      const d = new Date(i.income_date);
      months.add(d.toLocaleDateString("en-US", { year: "numeric", month: "long" }));
    });
    return [...months];
  }, [income]);

  // Apply tab + filters + sort
  const filteredExpenses = useMemo(() => {
    let result = expenses;

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

    if (paymentStatusFilter) {
      result = result.filter((e) => e.payment_status === paymentStatusFilter);
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
  }, [expenses, typeFilter, paymentStatusFilter, search, monthFilter, categoryFilter, sortField, sortDir]);

  // Same filters + sort, income side
  const filteredIncome = useMemo(() => {
    let result = income;

    if (incomeSearch) {
      const q = incomeSearch.toLowerCase();
      result = result.filter((i) =>
        (i.description || "").toLowerCase().includes(q) ||
        (i.notes || "").toLowerCase().includes(q)
      );
    }

    if (incomeMonthFilter) {
      result = result.filter((i) => {
        const d = new Date(i.income_date);
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long" }) === incomeMonthFilter;
      });
    }

    if (incomeCategoryFilter) {
      result = result.filter((i) => i.income_categories?.name === incomeCategoryFilter);
    }

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.income_date).getTime() - new Date(b.income_date).getTime();
      } else if (sortField === "amount") {
        cmp = a.amount - b.amount;
      } else if (sortField === "category") {
        cmp = (a.income_categories?.name || "").localeCompare(b.income_categories?.name || "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [income, incomeSearch, incomeMonthFilter, incomeCategoryFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredExpenses.length / pageSize);
  const paginatedExpenses = filteredExpenses.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const incomeTotalPages = Math.ceil(filteredIncome.length / pageSize);
  const paginatedIncome = filteredIncome.slice((incomePage - 1) * pageSize, incomePage * pageSize);

  // Rows for the By Category report, flattened to whichever side is selected
  const reportEntries: ReportEntry[] = useMemo(() => {
    if (reportKind === "income") {
      const manual = filteredIncome.map((i) => ({
        categoryId: i.category_id,
        categoryName: i.income_categories?.name || "",
        amount: i.amount,
        date: i.income_date,
      }));
      // Subscription revenue joins the breakdown under its package name, the same
      // grouping the dashboard's income-by-package chart uses.
      const subs = paymentIncome
        .filter((p) => p.confirmed_at)
        .map((p) => {
          const name = p.subscriptions?.packages?.name || "Subscriptions";
          return { categoryId: `package:${name}`, categoryName: name, amount: p.amount, date: p.confirmed_at as string };
        });
      return [...manual, ...subs];
    }
    return filteredExpenses.map((e) => ({
      categoryId: e.category_id,
      categoryName: e.expense_categories?.name || "",
      amount: e.amount,
      date: e.expense_date,
    }));
  }, [reportKind, filteredIncome, filteredExpenses, paymentIncome]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, monthFilter, categoryFilter, typeFilter, paymentStatusFilter, tab]);

  useEffect(() => {
    setIncomePage(1);
  }, [incomeSearch, incomeMonthFilter, incomeCategoryFilter, tab]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleEdit(expense: ExpenseRow) {
    setEditingIncome(null);
    setEditingExpense(expense);
    setEntryKind("expense");
    setEntryDrawerOpen(true);
  }

  function handleDelete(id: string) {
    setDeletingId(id);
  }

  function handleEditIncome(item: IncomeRow) {
    setEditingExpense(null);
    setEditingIncome(item);
    setEntryKind("income");
    setEntryDrawerOpen(true);
  }

  /** One Add button for both sides — opens on Expense, switchable in the drawer */
  function openAddEntry() {
    setEditingExpense(null);
    setEditingIncome(null);
    setEntryKind("expense");
    setEntryDrawerOpen(true);
  }

  function closeEntryDrawer() {
    setEntryDrawerOpen(false);
    setEditingExpense(null);
    setEditingIncome(null);
  }

  function openCategoryDrawer(kind: EntryKind) {
    setCategoryDrawerKind(kind);
    setCategoryDrawerOpen(true);
  }

  async function confirmDeleteIncome() {
    if (!deletingIncomeId) return;
    const res = await deleteIncome(deletingIncomeId);
    setDeletingIncomeId(null);
    if ("error" in res) {
      setToast({ message: res.error ?? "Failed to delete income", variant: "error" });
    } else {
      setToast({ message: "Income deleted", variant: "success" });
    }
    fetchData();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    const res = await deleteExpense(deletingId);
    setDeletingId(null);
    if ("error" in res) {
      setToast({ message: res.error ?? "Failed to delete expense", variant: "error" });
    } else {
      setToast({ message: "Expense deleted", variant: "success" });
    }
    fetchData();
  }

  function resetFilters() {
    setSearch("");
    setMonthFilter("");
    setCategoryFilter("");
    setTypeFilter("");
    setPaymentStatusFilter("");
  }

  function resetIncomeFilters() {
    setIncomeSearch("");
    setIncomeMonthFilter("");
    setIncomeCategoryFilter("");
  }

  // Held in state rather than derived, so the summary stays put while the drawer animates out
  const [deletingExpense, setDeletingExpense] = useState<ExpenseRow | null>(null);
  const [deletingIncome, setDeletingIncome] = useState<IncomeRow | null>(null);

  useEffect(() => {
    const row = expenses.find((e) => e.id === deletingId);
    if (row) setDeletingExpense(row);
  }, [deletingId, expenses]);

  useEffect(() => {
    const row = income.find((i) => i.id === deletingIncomeId);
    if (row) setDeletingIncome(row);
  }, [deletingIncomeId, income]);

  const hasActiveFilters = !!search || !!monthFilter || !!categoryFilter || !!typeFilter || !!paymentStatusFilter;
  const hasActiveIncomeFilters = !!incomeSearch || !!incomeMonthFilter || !!incomeCategoryFilter;
  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Finances</h1>
          <p className="text-slate-500 text-sm">
            Track income, court reservations, salaries, and other costs
          </p>
        </div>
        {tab !== "payments" && (
        <div className="flex gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const { exportToExcel } = await import("@/lib/utils/export-excel");
              const monthLabel = tab === "income" ? incomeMonthFilter : monthFilter;
              const dateStr = monthLabel || new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
              const slug = dateStr.replace(/\s/g, "-").toLowerCase();

              if (tab === "income") {
                const rows = filteredIncome.map((i) => ({
                  Date: i.income_date,
                  Category: i.income_categories?.name || "",
                  Description: i.description || "",
                  "Amount (EGP)": i.amount,
                  Notes: i.notes || "",
                }));
                exportToExcel(rows, `income-${slug}`, "Income");
                return;
              }

              const rows = filteredExpenses.map((e) => ({
                Date: e.expense_date,
                Category: e.expense_categories?.name || "",
                Description: e.description,
                "Amount (EGP)": e.amount,
                Type: e.is_recurring ? `Recurring (${e.recurrence_type})` : "One-time",
                Payment: e.payment_status === "paid_full" ? "Paid" : e.payment_status === "partially_paid" ? `Partial (${e.paid_amount ?? 0} EGP)` : "Due",
              }));
              exportToExcel(rows, `expenses-${slug}`, "Expenses");
            }}
            disabled={tab === "income" ? filteredIncome.length === 0 : filteredExpenses.length === 0}
            aria-label="Export to Excel"
            className="!px-3 sm:!px-4"
          >
            <Download className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            onClick={openAddEntry}
            aria-label="Add income or expense"
            className="!px-3 sm:!px-4"
          >
            <Plus className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
        )}
      </div>


      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label={`Income (${currentMonth})`}
          value={`${totalIncomeThisMonth.toLocaleString()} EGP`}
          accentColor="bg-emerald-500"
          icon={<TrendingUp className="w-5 h-5" />}
          subtitle={`All Time: ${totalIncomeAllTime.toLocaleString()} EGP`}
        />
        <StatCard
          label={`Expenses (${currentMonth})`}
          value={`${totalThisMonth.toLocaleString()} EGP`}
          accentColor="bg-red-500"
          icon={<Receipt className="w-5 h-5" />}
          subtitle={`All Time: ${allTimeTotal.toLocaleString()} EGP`}
        />
        <StatCard
          label={`Net (${currentMonth})`}
          value={`${netThisMonth.toLocaleString()} EGP`}
          accentColor={netThisMonth >= 0 ? "bg-emerald-500" : "bg-red-500"}
          icon={<Scale className="w-5 h-5" />}
          subtitle={`All Time: ${netAllTime.toLocaleString()} EGP`}
        />
        <StatCard
          label="Recurring / Month"
          value={`${recurringMonthly.toLocaleString()} EGP`}
          accentColor="bg-amber-500"
          icon={<Repeat className="w-5 h-5" />}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
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
      </div>

      {/* Tab content */}
      {tab === "payments" ? (
        <PaymentsView />
      ) : tab === "income" ? (
        <>
          <ExpensesFilters
            search={incomeSearch}
            onSearchChange={setIncomeSearch}
            categoryFilter={incomeCategoryFilter}
            onCategoryFilterChange={setIncomeCategoryFilter}
            categoryOptions={incomeCategoryOptions}
            monthFilter={incomeMonthFilter}
            onMonthFilterChange={setIncomeMonthFilter}
            monthOptions={incomeMonthOptions}
            searchPlaceholder="Search income..."
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={toggleSort}
            onReset={resetIncomeFilters}
            hasActiveFilters={hasActiveIncomeFilters}
          />

          <div className="flex-1">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-sm">Loading income...</div>
            ) : (
              <IncomeTableView
                income={paginatedIncome}
                onEdit={handleEditIncome}
                onDelete={setDeletingIncomeId}
                grandTotal={filteredIncome.reduce((sum, i) => sum + i.amount, 0)}
              />
            )}
          </div>
          <Pagination
            currentPage={incomePage}
            totalPages={incomeTotalPages}
            onPageChange={setIncomePage}
            pageSize={pageSize}
            onPageSizeChange={(size) => { setPageSize(size); setIncomePage(1); }}
          />
        </>
      ) : tab === "categories" ? (
        <div className="space-y-8">
          <CategoriesView
            title="Expense Categories"
            categories={categories}
            onManage={() => openCategoryDrawer("expense")}
          />
          <CategoriesView
            title="Income Categories"
            categories={incomeCategories}
            onManage={() => openCategoryDrawer("income")}
          />
        </div>
      ) : tab === "by-category" ? (
        <div className="space-y-4">
          <div className="sm:max-w-xs">
            <EntryTypeSwitch value={reportKind} onChange={setReportKind} />
          </div>
          <CategoryReport entries={reportEntries} kind={reportKind} />
        </div>
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
            paymentStatusFilter={paymentStatusFilter}
            onPaymentStatusFilterChange={setPaymentStatusFilter}
            sortField={sortField}
            sortDir={sortDir}
            onSortChange={toggleSort}
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
                grandTotal={filteredExpenses.reduce((sum, e) => sum + e.amount, 0)}
              />
            )}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      {/* Add / edit drawer — both sides share one drawer so switching type stays in place */}
      <EntryDrawer
        open={entryDrawerOpen}
        onClose={closeEntryDrawer}
        kind={entryKind}
        onKindChange={setEntryKind}
        expenseCategories={categories}
        incomeCategories={incomeCategories}
        editingExpense={editingExpense}
        editingIncome={editingIncome}
        onExpenseSuccess={() => { setToast({ message: "Expense saved successfully", variant: "success" }); fetchData(); }}
        onIncomeSuccess={() => { setToast({ message: "Income saved successfully", variant: "success" }); fetchData(); }}
        onCategoriesChange={fetchData}
      />

      {/* Category drawer */}
      <CategoryDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        kind={categoryDrawerKind}
        categories={categoryDrawerKind === "income" ? incomeCategories : categories}
        onSuccess={() => { setToast({ message: "Category updated", variant: "success" }); fetchData(); }}
      />

      {/* Delete confirmations */}
      <ConfirmDrawer
        open={!!deletingIncomeId}
        onClose={() => setDeletingIncomeId(null)}
        onConfirm={confirmDeleteIncome}
        title="Delete Income"
        description="Are you sure you want to delete this income entry? This action cannot be undone."
        details={deletingIncome && (
          <DeleteSummary
            title={deletingIncome.description || deletingIncome.income_categories?.name || "Income"}
            meta={[
              deletingIncome.description ? deletingIncome.income_categories?.name : null,
              formatDate(deletingIncome.income_date),
            ]}
            amount={deletingIncome.amount}
            notes={deletingIncome.notes}
          />
        )}
      />

      <ConfirmDrawer
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={confirmDelete}
        title="Delete Expense"
        description="Are you sure you want to delete this expense? This action cannot be undone."
        details={deletingExpense && (
          <DeleteSummary
            title={deletingExpense.description}
            meta={[
              deletingExpense.expense_categories?.name,
              formatDate(deletingExpense.expense_date),
            ]}
            amount={deletingExpense.amount}
            notes={deletingExpense.notes}
            badges={
              <>
                {deletingExpense.is_recurring ? (
                  <Badge variant="info">
                    Recurring ({deletingExpense.recurrence_type === "weekly" ? "weekly" : "monthly"})
                  </Badge>
                ) : (
                  <Badge variant="neutral">One-time</Badge>
                )}
                {deletingExpense.payment_status === "paid_full" && <Badge variant="success">Paid</Badge>}
                {deletingExpense.payment_status === "partially_paid" && (
                  <Badge variant="warning">
                    Partial ({(deletingExpense.paid_amount ?? 0).toLocaleString()} EGP paid)
                  </Badge>
                )}
                {deletingExpense.payment_status === "payment_due" && <Badge variant="danger">Due</Badge>}
              </>
            }
          />
        )}
      />
    </div>
  );
}

function CategoriesView({ title, categories, onManage }: { title: string; categories: CategoryRow[]; onManage: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg tracking-tight text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">
            {categories.length} categories ({categories.filter((c) => c.is_active).length} active)
          </p>
        </div>
        <Button variant="outline" onClick={onManage} className="shrink-0">
          <Settings className="w-4 h-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Manage</span>
        </Button>
      </div>
      {categories.length === 0 && (
        <p className="text-sm text-slate-400 py-4">No categories yet</p>
      )}
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

/** Compact read-only summary of the record a delete confirmation is about to remove */
function DeleteSummary({
  title,
  meta,
  amount,
  notes,
  badges,
}: {
  title: string;
  meta: (string | null | undefined)[];
  amount: number;
  notes?: string | null;
  badges?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900 break-words min-w-0">{title}</p>
        <p className="text-sm font-bold text-slate-900 shrink-0 tabular-nums">
          {amount.toLocaleString()} EGP
        </p>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{meta.filter(Boolean).join(" · ")}</p>
      {badges && <div className="flex flex-wrap items-center gap-1.5 mt-3">{badges}</div>}
      {notes && <p className="text-xs text-slate-400 mt-3 break-words">{notes}</p>}
    </div>
  );
}
