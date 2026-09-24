import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/ui";
import { Users, CreditCard, Receipt, TrendingUp } from "lucide-react";
import { RevenueCard } from "./revenue-card";
import { DashboardCharts } from "./_components/dashboard-charts";
import { MonthlyFinancialTable } from "./_components/monthly-financial-table";
import { MetricsTable } from "./_components/metrics-table";
import type { PackageIncome } from "./_components/income-by-package";
import { cairoMonthKey, cairoNowYearMonth } from "@/lib/utils/cairo-time";

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Stats queries in parallel
  const currentMonthKey = cairoMonthKey(new Date()); // "YYYY-MM" in Africa/Cairo

  const [
    { data: allPlayerProfiles, count: playerCount },
    { data: pendingPaymentRows, count: pendingPayments },
    // ALL confirmed payments — drives monthly revenue, all-time revenue, chart, and monthly table
    { data: revenuePayments },
    // ALL subscriptions (any status) with package join — drives chart + metrics table
    { data: allSubscriptions },
    // ALL active expenses with full fields — drives monthly, all-time, recurring, monthly table
    { data: allExpensesWithDates },
    { count: activePlayerCount },
    { data: groupsData },
    { data: groupPlayersData },
    { data: attendanceAll },
    // Manually recorded income (merch, sponsorships, ...) — added to revenue alongside payments
    { data: otherIncomeData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, created_at", { count: "exact" })
      .eq("role", "player"),
    supabase
      .from("payments")
      .select("amount", { count: "exact" })
      .eq("status", "pending"),
    supabase
      .from("payments")
      .select("amount, confirmed_at, subscriptions(packages(name))")
      .eq("status", "confirmed"),
    supabase
      .from("subscriptions")
      .select("player_id, package_id, status, start_date, end_date, created_at, packages(name)"),
    supabase
      .from("expenses")
      .select("amount, expense_date, is_recurring, recurrence_type, expense_categories(name)")
      .eq("is_active", true),
    supabase
      .from("players_with_status")
      .select("id", { count: "exact", head: true })
      .eq("is_currently_active", true),
    supabase
      .from("groups")
      .select("id, name, max_players")
      .eq("is_active", true),
    supabase
      .from("group_players")
      .select("group_id, player_id, joined_at, is_active"),
    supabase
      .from("attendance")
      .select("status, session_date, group_id"),
    supabase
      .from("income")
      .select("amount, income_date, income_categories(name)")
      .eq("is_active", true),
  ]);

  // Derive everything else in JS — no extra queries
  const monthlyRevenuePayments = ((revenuePayments || []) as { amount: number; confirmed_at: string | null }[])
    .filter((p) => p.confirmed_at && cairoMonthKey(new Date(p.confirmed_at)) === currentMonthKey);
  const revenueData = monthlyRevenuePayments;

  // Expense slices — expense_date is a DATE (no timezone), so its YYYY-MM
  // prefix is already the calendar month it was logged for.
  const oneTimeExpenseData = ((allExpensesWithDates || []) as { amount: number; expense_date: string; is_recurring: boolean }[])
    .filter((e) => !e.is_recurring && e.expense_date?.slice(0, 7) === currentMonthKey);
  const recurringExpenseData = ((allExpensesWithDates || []) as { amount: number; is_recurring: boolean; recurrence_type: string | null }[])
    .filter((e) => e.is_recurring);
  const allExpenseData = allExpensesWithDates;

  // Other income — income_date is a DATE, so its YYYY-MM prefix is the month it was logged for
  const otherIncomeRows = ((otherIncomeData || []) as { amount: number; income_date: string; income_categories: { name: string } | null }[])
    .filter((i) => i.income_date);
  const monthlyOtherIncome = otherIncomeRows
    .filter((i) => i.income_date.slice(0, 7) === currentMonthKey)
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const allTimeOtherIncome = otherIncomeRows.reduce((sum, i) => sum + Number(i.amount), 0);

  const monthlyRevenue = (revenueData || []).reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  ) + monthlyOtherIncome;

  const totalRevenue = (revenuePayments || []).reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  ) + allTimeOtherIncome;

  // Expenses calculation
  const oneTimeExpenses = (oneTimeExpenseData || []).reduce(
    (sum: number, e: { amount: number }) => sum + e.amount,
    0
  );
  const recurringExpenses = (recurringExpenseData || [])
    .filter((e: { recurrence_type: string | null }) => e.recurrence_type === "monthly")
    .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)
    + (recurringExpenseData || [])
    .filter((e: { recurrence_type: string | null }) => e.recurrence_type === "weekly")
    .reduce((sum: number, e: { amount: number }) => sum + e.amount * 4, 0);
  const monthlyExpenses = oneTimeExpenses + recurringExpenses;
  const monthlyProfit = monthlyRevenue - monthlyExpenses;

  const allTimeExpenses = (allExpenseData || []).reduce(
    (sum: number, e: { amount: number }) => sum + e.amount,
    0
  );
  const allTimeProfit = totalRevenue - allTimeExpenses;

  const pendingAmount = ((pendingPaymentRows || []) as { amount: number }[]).reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  // --- Chart data transformations ---

  // Confirmed income per package per Cairo month
  const incomeByPackageKey = new Map<string, PackageIncome>();
  for (const p of (revenuePayments || []) as { amount: number; confirmed_at: string | null; subscriptions: { packages: { name: string } | null } | null }[]) {
    if (!p.confirmed_at) continue;
    const d = new Date(p.confirmed_at);
    if (isNaN(d.getTime())) continue;
    const month = cairoMonthKey(d);
    const pkg = p.subscriptions?.packages?.name || "No package";
    const key = `${month}|${pkg}`;
    const entry = incomeByPackageKey.get(key) ?? { month, pkg, amount: 0 };
    entry.amount += Number(p.amount);
    incomeByPackageKey.set(key, entry);
  }
  // Other income shows as its own series per category
  for (const i of otherIncomeRows) {
    const month = i.income_date.slice(0, 7);
    const pkg = i.income_categories?.name || "Other income";
    const key = `${month}|${pkg}`;
    const entry = incomeByPackageKey.get(key) ?? { month, pkg, amount: 0 };
    entry.amount += Number(i.amount);
    incomeByPackageKey.set(key, entry);
  }
  const incomeByPackage = [...incomeByPackageKey.values()];

  // --- Monthly financial table data ---
  type MonthlyRow = { month: string; key: string; income: number; expenses: number; rentals: number; profit: number; profitExRentals: number };

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Income by month — uses confirmed_at, grouped by Cairo month
  const incomeByMonth: Record<string, number> = {};
  for (const p of (revenuePayments || []) as { amount: number; confirmed_at: string | null }[]) {
    if (!p.confirmed_at) continue;
    const d = new Date(p.confirmed_at);
    if (isNaN(d.getTime())) continue;
    const k = cairoMonthKey(d);
    incomeByMonth[k] = (incomeByMonth[k] || 0) + p.amount;
  }
  for (const i of otherIncomeRows) {
    const k = i.income_date.slice(0, 7);
    incomeByMonth[k] = (incomeByMonth[k] || 0) + Number(i.amount);
  }

  // Expenses by month, with court rentals tracked separately so the table can
  // show profit with them added back in. The expenses module files them under
  // the "Court Reservation" category.
  const expenseByMonth: Record<string, number> = {};
  const rentalByMonth: Record<string, number> = {};
  const cairoNow = cairoNowYearMonth();
  for (const e of (allExpensesWithDates || []) as { amount: number; expense_date: string; is_recurring: boolean; recurrence_type: string | null; expense_categories: { name: string } | null }[]) {
    if (!e.expense_date) continue;
    const isRental = e.expense_categories?.name === "Court Reservation";
    if (!e.is_recurring) {
      // expense_date is DATE; use its YYYY-MM directly
      const k = e.expense_date.slice(0, 7);
      expenseByMonth[k] = (expenseByMonth[k] || 0) + e.amount;
      if (isRental) rentalByMonth[k] = (rentalByMonth[k] || 0) + e.amount;
    } else {
      const monthlyAmount = e.recurrence_type === "weekly" ? e.amount * 4 : e.amount;
      const [startY, startM] = e.expense_date.slice(0, 7).split("-").map(Number);
      let y = startY;
      let m = startM;
      while (y < cairoNow.year || (y === cairoNow.year && m <= cairoNow.month)) {
        const k = `${y}-${String(m).padStart(2, "0")}`;
        expenseByMonth[k] = (expenseByMonth[k] || 0) + monthlyAmount;
        if (isRental) rentalByMonth[k] = (rentalByMonth[k] || 0) + monthlyAmount;
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
    }
  }

  // Merge all months and sort newest first
  const allMonthKeys = new Set([...Object.keys(incomeByMonth), ...Object.keys(expenseByMonth)]);
  const monthlyData: MonthlyRow[] = Array.from(allMonthKeys)
    .sort((a, b) => b.localeCompare(a))
    .map((k) => {
      const income = incomeByMonth[k] || 0;
      const expenses = expenseByMonth[k] || 0;
      const rentals = rentalByMonth[k] || 0;
      return {
        month: monthLabel(k),
        key: k,
        income,
        expenses,
        rentals,
        profit: income - expenses,
        profitExRentals: income - expenses + rentals,
      };
    });

  // Groups and memberships for the metrics table
  const groups = (groupsData || []) as { id: string; name: string; max_players: number }[];
  const allGpRows = (groupPlayersData || []) as { group_id: string; player_id: string; joined_at: string; is_active: boolean }[];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-sand/10">
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-secondary uppercase tracking-[0.18em]">
              {today}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl text-primary-900 mt-1.5 tracking-tight">
              Welcome back, {currentUser.profile.first_name}.
            </h1>
            <p className="text-primary-700/60 text-sm mt-1">
              Here&apos;s what&apos;s happening across the academy.
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
          <StatCard
            label="Active Players"
            value={activePlayerCount ?? 0}
            accentColor="bg-primary-800"
            icon={<Users className="w-5 h-5" />}
            subtitle={`Total: ${playerCount ?? 0}`}
            href="/admin/players?activity=Active"
          />
          <RevenueCard
            label={`Revenue (${currentMonth})`}
            value={`${monthlyRevenue.toLocaleString()} EGP`}
            subtitle={`All Time: ${totalRevenue.toLocaleString()} EGP`}
          />
          <StatCard
            label={`Expenses (${currentMonth})`}
            value={`${monthlyExpenses.toLocaleString()} EGP`}
            accentColor="bg-danger"
            icon={<Receipt className="w-5 h-5" />}
            subtitle={`All Time: ${allTimeExpenses.toLocaleString()} EGP`}
            href="/admin/expenses"
          />
          <StatCard
            label={`Profit (${currentMonth})`}
            value={`${monthlyProfit.toLocaleString()} EGP`}
            accentColor={monthlyProfit >= 0 ? "bg-success" : "bg-danger"}
            icon={<TrendingUp className="w-5 h-5" />}
            subtitle={`All Time: ${allTimeProfit.toLocaleString()} EGP`}
          />
          <StatCard
            label="Pending Payments"
            value={pendingPayments ?? 0}
            accentColor={pendingPayments ? "bg-accent" : "bg-primary-200"}
            icon={<CreditCard className="w-5 h-5" />}
            subtitle={`Amount: ${pendingAmount.toLocaleString()} EGP`}
            href="/admin/payments?statusFilter=Pending"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        {/* Key Metrics Table */}
        <div className="mb-8">
          <MetricsTable
            attendanceRecords={(attendanceAll || []) as { status: string; session_date: string; group_id: string }[]}
            subscriptions={(allSubscriptions || []) as { player_id: string; status: string; start_date: string | null; end_date: string | null; created_at: string }[]}
            profiles={(allPlayerProfiles || []) as { id: string; created_at: string }[]}
            groupPlayers={allGpRows}
            groups={groups.map((g) => ({ id: g.id, max_players: g.max_players }))}
          />
        </div>

        {/* Charts */}
        <DashboardCharts
        revenuePayments={[
          ...(revenuePayments || []).map((p: { amount: number; confirmed_at: string | null }) => ({
            amount: p.amount,
            date: p.confirmed_at || "",
          })),
          // Midday Cairo so the DATE never shifts to a neighbouring day
          ...otherIncomeRows.map((i) => ({ amount: Number(i.amount), date: `${i.income_date}T12:00:00+02:00` })),
        ].filter((p: { date: string }) => p.date && !isNaN(new Date(p.date).getTime()))}
        incomeByPackage={incomeByPackage}
        currentMonthKey={currentMonthKey}
      />

        {/* Monthly Financial Table */}
        <div className="mb-6">
          <MonthlyFinancialTable data={monthlyData} />
        </div>
      </div>
    </div>
  );
}
