import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { Users, CreditCard, CalendarDays, Receipt, TrendingUp, BarChart3 } from "lucide-react";
import { RevenueCard } from "./revenue-card";
import { DashboardCharts } from "./_components/dashboard-charts";
import { MonthlyFinancialTable } from "./_components/monthly-financial-table";
import { MetricsTable } from "./_components/metrics-table";
import { cairoMonthKey, cairoNowYearMonth } from "@/lib/utils/cairo-time";

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Stats queries in parallel
  const todayDow = new Date().getDay();

  const currentMonthKey = cairoMonthKey(new Date()); // "YYYY-MM" in Africa/Cairo

  const [
    { data: allPlayerProfiles, count: playerCount },
    { count: pendingPayments },
    { count: todaySessionCount },
    // ALL confirmed payments — drives monthly revenue, all-time revenue, chart, and monthly table
    { data: revenuePayments },
    // ALL subscriptions (any status) with package join — drives chart + metrics table
    { data: allSubscriptions },
    // ALL active expenses with full fields — drives monthly, all-time, recurring, monthly table
    { data: allExpensesWithDates },
    { data: recentAttendance },
    { data: groupsData },
    { data: groupPlayersData },
    { data: attendanceAll },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, created_at", { count: "exact" })
      .eq("role", "player"),
    supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("schedule_sessions")
      .select("*", { count: "exact", head: true })
      .eq("day_of_week", todayDow)
      .eq("is_active", true),
    supabase
      .from("payments")
      .select("amount, confirmed_at")
      .eq("status", "confirmed"),
    supabase
      .from("subscriptions")
      .select("player_id, package_id, status, start_date, end_date, created_at, packages(name)"),
    supabase
      .from("expenses")
      .select("amount, expense_date, is_recurring, recurrence_type")
      .eq("is_active", true),
    supabase
      .from("attendance")
      .select("player_id")
      .eq("status", "present")
      .gte("session_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
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
  ]);

  // Derive everything else in JS — no extra queries
  const activeProfiles = allPlayerProfiles;
  const monthlyRevenuePayments = ((revenuePayments || []) as { amount: number; confirmed_at: string | null }[])
    .filter((p) => p.confirmed_at && cairoMonthKey(new Date(p.confirmed_at)) === currentMonthKey);
  const revenueData = monthlyRevenuePayments;

  // Active subscriptions for the chart
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSubscriptions = ((allSubscriptions || []) as any[]).filter((s) => s.status === "active");

  // Expense slices — expense_date is a DATE (no timezone), so its YYYY-MM
  // prefix is already the calendar month it was logged for.
  const oneTimeExpenseData = ((allExpensesWithDates || []) as { amount: number; expense_date: string; is_recurring: boolean }[])
    .filter((e) => !e.is_recurring && e.expense_date?.slice(0, 7) === currentMonthKey);
  const recurringExpenseData = ((allExpensesWithDates || []) as { amount: number; is_recurring: boolean; recurrence_type: string | null }[])
    .filter((e) => e.is_recurring);
  const allExpenseData = allExpensesWithDates;

  const monthlyRevenue = (revenueData || []).reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  );

  const totalRevenue = (revenuePayments || []).reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  );

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

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  // Active players: trained in last 30 days
  const playerIdSet = new Set(
    (activeProfiles || []).map((p: { id: string }) => p.id)
  );
  const activeIds = new Set<string>();
  for (const a of recentAttendance || []) {
    const pid = (a as { player_id: string }).player_id;
    if (playerIdSet.has(pid)) activeIds.add(pid);
  }
  const activePlayerCount = activeIds.size;

  // --- Chart data transformations ---

  // Subscriptions by package
  const subCounts: Record<string, number> = {};
  for (const s of activeSubscriptions || []) {
    const name = (s.packages as { name: string } | null)?.name || "Unknown";
    subCounts[name] = (subCounts[name] || 0) + 1;
  }
  const subsByPackage = Object.entries(subCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // --- Monthly financial table data ---
  type MonthlyRow = { month: string; key: string; income: number; expenses: number; profit: number };

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

  // Expenses by month
  const expenseByMonth: Record<string, number> = {};
  const cairoNow = cairoNowYearMonth();
  for (const e of (allExpensesWithDates || []) as { amount: number; expense_date: string; is_recurring: boolean; recurrence_type: string | null }[]) {
    if (!e.expense_date) continue;
    if (!e.is_recurring) {
      // expense_date is DATE; use its YYYY-MM directly
      const k = e.expense_date.slice(0, 7);
      expenseByMonth[k] = (expenseByMonth[k] || 0) + e.amount;
    } else {
      const monthlyAmount = e.recurrence_type === "weekly" ? e.amount * 4 : e.amount;
      const [startY, startM] = e.expense_date.slice(0, 7).split("-").map(Number);
      let y = startY;
      let m = startM;
      while (y < cairoNow.year || (y === cairoNow.year && m <= cairoNow.month)) {
        const k = `${y}-${String(m).padStart(2, "0")}`;
        expenseByMonth[k] = (expenseByMonth[k] || 0) + monthlyAmount;
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
      return { month: monthLabel(k), key: k, income, expenses, profit: income - expenses };
    });

  // Group player counts
  const groups = (groupsData || []) as { id: string; name: string; max_players: number }[];
  const allGpRows = (groupPlayersData || []) as { group_id: string; player_id: string; joined_at: string; is_active: boolean }[];
  const gpRows = allGpRows.filter((gp) => gp.is_active);
  const gpCountByGroup: Record<string, number> = {};
  for (const gp of gpRows) {
    gpCountByGroup[gp.group_id] = (gpCountByGroup[gp.group_id] || 0) + 1;
  }
  const groupCounts = groups
    .map((g) => ({ name: g.name, count: gpCountByGroup[g.id] || 0, max: g.max_players }))
    .sort((a, b) => b.count - a.count);

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
            value={activePlayerCount}
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
            href="/admin/payments?statusFilter=Pending"
          />
          <StatCard
            label="Sessions Today"
            value={todaySessionCount ?? 0}
            accentColor="bg-secondary"
            icon={<CalendarDays className="w-5 h-5" />}
            href="/admin/daily-report"
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

        {/* Group Breakdown */}
        {groupCounts.length > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-2xl border border-primary-100 p-5 sm:p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-secondary" />
                  Players by Group
                </h2>
                <span className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider">
                  Capacity
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groupCounts.map((g) => {
                  const pct = g.max > 0 ? Math.min(100, (g.count / g.max) * 100) : 0;
                  const full = pct >= 90;
                  return (
                    <div
                      key={g.name}
                      className="rounded-xl border border-primary-100 p-4 hover:border-primary-300 transition-colors"
                    >
                      <div className="flex items-baseline justify-between mb-2">
                        <p className="text-sm font-semibold text-primary-900 truncate">
                          {g.name}
                        </p>
                        <p className="text-sm font-bold text-primary-900 shrink-0">
                          {g.count}
                          <span className="text-xs font-normal text-primary-700/40">
                            {" "}/ {g.max}
                          </span>
                        </p>
                      </div>
                      <div className="h-1.5 bg-primary-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            full ? "bg-accent" : "bg-secondary"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        <DashboardCharts
        revenuePayments={(revenuePayments || [])
          .map((p: { amount: number; confirmed_at: string | null }) => ({
            amount: p.amount,
            date: p.confirmed_at || "",
          }))
          .filter((p: { date: string }) => p.date && !isNaN(new Date(p.date).getTime()))}
        subsByPackage={subsByPackage}
      />

        {/* Monthly Financial Table */}
        <div className="mb-6">
          <MonthlyFinancialTable data={monthlyData} />
        </div>
      </div>
    </div>
  );
}
