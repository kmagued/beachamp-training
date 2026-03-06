import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { StatCard, Card } from "@/components/ui";
import { Users, CreditCard, CalendarDays, Receipt, TrendingUp, BarChart3 } from "lucide-react";
import { RevenueCard } from "./revenue-card";
import { DashboardCharts } from "./_components/dashboard-charts";
import { MonthlyFinancialTable } from "./_components/monthly-financial-table";
import { MetricsTable } from "./_components/metrics-table";

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Stats queries in parallel
  const todayDow = new Date().getDay();

  const monthStartISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const monthEndISO = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0];
  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [
    { data: activeProfiles, count: playerCount },
    { count: pendingPayments },
    { data: revenueData },
    { data: activeSubscriptions },
    { count: todaySessionCount },
    { data: revenuePayments },
    { data: oneTimeExpenseData },
    { data: recurringExpenseData },
    { data: allExpenseData },
    { data: recentAttendance },
    { data: allExpensesWithDates },
    { data: groupsData },
    { data: groupPlayersData },
    { data: attendanceAll },
    { data: allSubscriptions },
    { data: allPlayerProfiles },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact" })
      .eq("role", "player"),
    supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("payments")
      .select("amount")
      .eq("status", "confirmed")
      .gte("confirmed_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase
      .from("subscriptions")
      .select("player_id, package_id, packages(name)")
      .eq("status", "active"),
    supabase
      .from("schedule_sessions")
      .select("*", { count: "exact", head: true })
      .eq("day_of_week", todayDow)
      .eq("is_active", true),
    // All confirmed payments for revenue chart
    supabase
      .from("payments")
      .select("amount, confirmed_at, subscriptions!payments_subscription_id_fkey(start_date)")
      .eq("status", "confirmed"),
    // One-time expenses this month
    supabase
      .from("expenses")
      .select("amount")
      .eq("is_active", true)
      .eq("is_recurring", false)
      .gte("expense_date", monthStartISO)
      .lte("expense_date", monthEndISO),
    // Active recurring expenses
    supabase
      .from("expenses")
      .select("amount, recurrence_type")
      .eq("is_active", true)
      .eq("is_recurring", true),
    // All expenses (for all-time total)
    supabase
      .from("expenses")
      .select("amount")
      .eq("is_active", true),
    // Recent attendance (last 2 weeks) for active player count
    supabase
      .from("attendance")
      .select("player_id")
      .eq("status", "present")
      .gte("session_date", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
    // All expenses with dates for monthly table
    supabase
      .from("expenses")
      .select("amount, expense_date, is_recurring, recurrence_type")
      .eq("is_active", true),
    // Groups
    supabase
      .from("groups")
      .select("id, name, max_players")
      .eq("is_active", true),
    // Group players (all, with joined_at for historical capacity)
    supabase
      .from("group_players")
      .select("group_id, player_id, joined_at, is_active"),
    // All attendance (last 12 months) for metrics table
    supabase
      .from("attendance")
      .select("status, session_date, group_id")
      .gte("session_date", twelveMonthsAgo),
    // All subscriptions for metrics table (churn/retention)
    supabase
      .from("subscriptions")
      .select("player_id, status, end_date, created_at"),
    // All player profiles (for new member counting)
    supabase
      .from("profiles")
      .select("id, created_at")
      .eq("role", "player"),
  ]);

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
    .filter((e: { recurrence_type: string }) => e.recurrence_type === "monthly")
    .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)
    + (recurringExpenseData || [])
    .filter((e: { recurrence_type: string }) => e.recurrence_type === "weekly")
    .reduce((sum: number, e: { amount: number }) => sum + e.amount * 4, 0);
  const monthlyExpenses = oneTimeExpenses + recurringExpenses;
  const monthlyProfit = monthlyRevenue - monthlyExpenses;

  const allTimeExpenses = (allExpenseData || []).reduce(
    (sum: number, e: { amount: number }) => sum + e.amount,
    0
  );
  const allTimeProfit = totalRevenue - allTimeExpenses;

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  // Active players: has active subscription OR trained in last 2 weeks
  const playerIdSet = new Set(
    (activeProfiles || []).map((p: { id: string }) => p.id)
  );
  const activeIds = new Set<string>();
  for (const s of activeSubscriptions || []) {
    const pid = (s as { player_id: string }).player_id;
    if (playerIdSet.has(pid)) activeIds.add(pid);
  }
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

  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = (key: string) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  // Income by month
  const incomeByMonth: Record<string, number> = {};
  for (const p of (revenuePayments || []) as { amount: number; confirmed_at: string | null; subscriptions: { start_date: string | null } | null }[]) {
    const dateStr = p.subscriptions?.start_date || p.confirmed_at;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    const k = monthKey(d);
    incomeByMonth[k] = (incomeByMonth[k] || 0) + p.amount;
  }

  // Expenses by month
  const expenseByMonth: Record<string, number> = {};
  const now = new Date();
  for (const e of (allExpensesWithDates || []) as { amount: number; expense_date: string; is_recurring: boolean; recurrence_type: string | null }[]) {
    if (!e.expense_date) continue;
    if (!e.is_recurring) {
      const d = new Date(e.expense_date);
      if (isNaN(d.getTime())) continue;
      const k = monthKey(d);
      expenseByMonth[k] = (expenseByMonth[k] || 0) + e.amount;
    } else {
      const start = new Date(e.expense_date);
      if (isNaN(start.getTime())) continue;
      const monthlyAmount = e.recurrence_type === "weekly" ? e.amount * 4 : e.amount;
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      while (cursor <= end) {
        const k = monthKey(cursor);
        expenseByMonth[k] = (expenseByMonth[k] || 0) + monthlyAmount;
        cursor.setMonth(cursor.getMonth() + 1);
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          Admin Dashboard
        </h1>
        <p className="text-slate-500 text-sm">
          Welcome back, {currentUser.profile.first_name}. Here&apos;s what&apos;s happening.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Active Players"
          value={activePlayerCount}
          accentColor="bg-primary"
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
          accentColor="bg-red-500"
          icon={<Receipt className="w-5 h-5" />}
          subtitle={`All Time: ${allTimeExpenses.toLocaleString()} EGP`}
          href="/admin/expenses"
        />
        <StatCard
          label={`Profit (${currentMonth})`}
          value={`${monthlyProfit.toLocaleString()} EGP`}
          accentColor={monthlyProfit >= 0 ? "bg-emerald-500" : "bg-red-500"}
          icon={<TrendingUp className="w-5 h-5" />}
          subtitle={`All Time: ${allTimeProfit.toLocaleString()} EGP`}
        />
        <StatCard
          label="Pending Payments"
          value={pendingPayments ?? 0}
          accentColor={pendingPayments ? "bg-amber-500" : "bg-slate-300"}
          icon={<CreditCard className="w-5 h-5" />}
          href="/admin/payments?statusFilter=Pending"
        />
        <StatCard
          label="Sessions Today"
          value={todaySessionCount ?? 0}
          accentColor="bg-brand-coach"
          icon={<CalendarDays className="w-5 h-5" />}
          href="/admin/daily-report"
        />
      </div>

      {/* Key Metrics Table */}
      <div className="mb-6">
        <MetricsTable
          attendanceRecords={(attendanceAll || []) as { status: string; session_date: string; group_id: string }[]}
          subscriptions={(allSubscriptions || []) as { player_id: string; status: string; end_date: string | null; created_at: string }[]}
          profiles={(allPlayerProfiles || []) as { id: string; created_at: string }[]}
          groupPlayers={allGpRows}
          groups={groups.map((g) => ({ id: g.id, max_players: g.max_players }))}
        />
      </div>

      {/* Group Breakdown */}
      {groupCounts.length > 0 && (
        <div className="mb-6">
          <Card>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              Players by Group
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {groupCounts.map((g) => (
                <div key={g.name} className="bg-slate-50 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-slate-500 truncate">{g.name}</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">
                    {g.count}
                    <span className="text-xs font-normal text-slate-400 ml-1">/ {g.max}</span>
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Charts */}
      <DashboardCharts
        revenuePayments={(revenuePayments || [])
          .map((p: { amount: number; confirmed_at: string | null; subscriptions: { start_date: string | null } | null }) => ({
            amount: p.amount,
            date: p.subscriptions?.start_date
              ? p.subscriptions.start_date + "T00:00:00"
              : p.confirmed_at || "",
          }))
          .filter((p: { date: string }) => p.date && !isNaN(new Date(p.date).getTime()))}
        subsByPackage={subsByPackage}
      />

      {/* Monthly Financial Table */}
      <div className="mb-6">
        <MonthlyFinancialTable data={monthlyData} />
      </div>
    </div>
  );
}
