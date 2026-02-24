import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { StatCard, Card, Badge } from "@/components/ui";
import { Users, CreditCard, CalendarDays, Receipt, TrendingUp, UserPlus, BarChart3, Target, RefreshCw, Gauge, UserMinus } from "lucide-react";
import { RevenueCard } from "./revenue-card";
import { DashboardCharts } from "./_components/dashboard-charts";
import { MonthlyFinancialTable } from "./_components/monthly-financial-table";

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Stats queries in parallel
  const todayDow = new Date().getDay();

  const monthStartISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const monthEndISO = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0];

  const [
    { data: activeProfiles, count: playerCount },
    { count: pendingPayments },
    { data: revenueData },
    { data: pendingPaymentsList },
    { data: activeSubscriptions },
    { count: todaySessionCount },
    { data: revenuePayments },
    { data: oneTimeExpenseData },
    { data: recurringExpenseData },
    { data: allExpenseData },
    { data: recentAttendance },
    { data: allExpensesWithDates },
    { count: newMembersCount },
    { data: groupsData },
    { data: groupPlayersData },
    { data: attendanceAll30d },
    { data: expiredSubsThisMonth },
    { data: scheduleSessions },
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
      .from("payments")
      .select("*, profiles!payments_player_id_fkey(first_name, last_name), subscriptions!payments_subscription_id_fkey(*, packages(name))")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
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
    // New members (last 30 days)
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "player")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    // Groups
    supabase
      .from("groups")
      .select("id, name, max_players")
      .eq("is_active", true),
    // Group players (active)
    supabase
      .from("group_players")
      .select("group_id, player_id")
      .eq("is_active", true),
    // All attendance last 30 days (for attendance rate)
    supabase
      .from("attendance")
      .select("status, group_id, schedule_session_id")
      .gte("session_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
    // Subscriptions that expired/cancelled this month (churn)
    supabase
      .from("subscriptions")
      .select("player_id")
      .in("status", ["expired", "cancelled"])
      .gte("end_date", monthStartISO)
      .lte("end_date", monthEndISO),
    // All active schedule sessions (for capacity utilization)
    supabase
      .from("schedule_sessions")
      .select("id, group_id")
      .eq("is_active", true),
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

  // Active players: has active subscription OR trained in last 2 weeks (matches getActivityStatus logic)
  // Only count profiles with role=player
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
  const currentMonthKey = monthKey(now);
  for (const e of (allExpensesWithDates || []) as { amount: number; expense_date: string; is_recurring: boolean; recurrence_type: string | null }[]) {
    if (!e.expense_date) continue;
    if (!e.is_recurring) {
      // One-time: assign to its month
      const d = new Date(e.expense_date);
      if (isNaN(d.getTime())) continue;
      const k = monthKey(d);
      expenseByMonth[k] = (expenseByMonth[k] || 0) + e.amount;
    } else {
      // Recurring: add to every month from expense_date to current month
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

  // --- Dashboard metrics ---

  // Group player counts
  const groups = (groupsData || []) as { id: string; name: string; max_players: number }[];
  const gpRows = (groupPlayersData || []) as { group_id: string; player_id: string }[];
  const gpCountByGroup: Record<string, number> = {};
  for (const gp of gpRows) {
    gpCountByGroup[gp.group_id] = (gpCountByGroup[gp.group_id] || 0) + 1;
  }
  const groupCounts = groups
    .map((g) => ({ name: g.name, count: gpCountByGroup[g.id] || 0, max: g.max_players }))
    .sort((a, b) => b.count - a.count);

  // Attendance rate (last 30 days)
  const att30d = (attendanceAll30d || []) as { status: string; group_id: string | null; schedule_session_id: string | null }[];
  const totalAttRecords = att30d.length;
  const presentRecords = att30d.filter((a) => a.status === "present").length;
  const attendanceRate = totalAttRecords > 0 ? Math.round((presentRecords / totalAttRecords) * 100) : 0;

  // Retention rate: active players now / (active players now + churned this month)
  const churnedThisMonth = new Set(
    ((expiredSubsThisMonth || []) as { player_id: string }[]).map((s) => s.player_id)
  ).size;
  const retentionRate = activePlayerCount + churnedThisMonth > 0
    ? Math.round((activePlayerCount / (activePlayerCount + churnedThisMonth)) * 100)
    : 100;

  // Capacity utilization: total active group players / total max capacity
  const totalGroupPlayers = gpRows.length;
  const totalCapacity = groups.reduce((s, g) => s + g.max_players, 0);
  const capacityRate = totalCapacity > 0 ? Math.round((totalGroupPlayers / totalCapacity) * 100) : 0;

  // Monthly churn rate: churned this month / (active + churned)
  const churnRate = activePlayerCount + churnedThisMonth > 0
    ? Math.round((churnedThisMonth / (activePlayerCount + churnedThisMonth)) * 100)
    : 0;

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
        />
        <StatCard
          label="Sessions Today"
          value={todaySessionCount ?? 0}
          accentColor="bg-brand-coach"
          icon={<CalendarDays className="w-5 h-5" />}
        />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="New Members (30d)"
          value={newMembersCount ?? 0}
          accentColor="bg-blue-500"
          icon={<UserPlus className="w-5 h-5" />}
        />
        <StatCard
          label="Attendance Rate"
          value={`${attendanceRate}%`}
          accentColor={attendanceRate >= 70 ? "bg-emerald-500" : attendanceRate >= 50 ? "bg-amber-500" : "bg-red-500"}
          icon={<Target className="w-5 h-5" />}
          subtitle={`${presentRecords} / ${totalAttRecords} (30d)`}
        />
        <StatCard
          label="Retention Rate"
          value={`${retentionRate}%`}
          accentColor={retentionRate >= 80 ? "bg-emerald-500" : retentionRate >= 60 ? "bg-amber-500" : "bg-red-500"}
          icon={<RefreshCw className="w-5 h-5" />}
        />
        <StatCard
          label="Capacity"
          value={`${capacityRate}%`}
          accentColor={capacityRate >= 80 ? "bg-red-500" : capacityRate >= 50 ? "bg-amber-500" : "bg-emerald-500"}
          icon={<Gauge className="w-5 h-5" />}
          subtitle={`${totalGroupPlayers} / ${totalCapacity} slots`}
        />
        <StatCard
          label="Monthly Churn"
          value={`${churnRate}%`}
          accentColor={churnRate <= 5 ? "bg-emerald-500" : churnRate <= 15 ? "bg-amber-500" : "bg-red-500"}
          icon={<UserMinus className="w-5 h-5" />}
          subtitle={`${churnedThisMonth} left this month`}
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

      {/* Pending Payments */}
      <div className="max-w-lg">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              Pending Payments
            </h2>
            <Link
              href="/admin/payments?status=pending"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {pendingPaymentsList && pendingPaymentsList.length > 0 ? (
            <div className="space-y-3">
              {pendingPaymentsList.map((payment: Record<string, unknown>) => {
                const profile = payment.profiles as { first_name: string; last_name: string } | null;
                const sub = payment.subscriptions as { packages: { name: string } } | null;
                return (
                  <Link
                    key={payment.id as string}
                    href={`/admin/payments?highlight=${payment.id as string}`}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 -mx-2 px-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {profile?.first_name} {profile?.last_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {sub?.packages?.name} &middot; {(payment.amount as number).toLocaleString()} EGP
                      </p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">
              No pending payments
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
