import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { StatCard, Card, Badge } from "@/components/ui";
import { Users, CreditCard, CalendarDays } from "lucide-react";
import { RevenueCard } from "./revenue-card";
import { DashboardCharts } from "./_components/dashboard-charts";

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Stats queries in parallel
  const todayDow = new Date().getDay();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: playerCount },
    { count: pendingPayments },
    { data: revenueData },
    { data: pendingPaymentsList },
    { data: recentPlayers },
    { data: activeSubscriptions },
    { data: totalRevenueData },
    { data: playerLevels },
    { count: todaySessionCount },
    { data: dailyRevenue },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "player")
      .eq("is_active", true),
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
      .from("profiles")
      .select("*, subscriptions!subscriptions_player_id_fkey(status, packages(name))")
      .eq("role", "player")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("subscriptions")
      .select("package_id, packages(name)")
      .eq("status", "active"),
    supabase
      .from("payments")
      .select("amount")
      .eq("status", "confirmed"),
    supabase
      .from("profiles")
      .select("playing_level")
      .eq("role", "player")
      .eq("is_active", true),
    supabase
      .from("schedule_sessions")
      .select("*", { count: "exact", head: true })
      .eq("day_of_week", todayDow)
      .eq("is_active", true),
    // Chart data: daily revenue last 30 days
    supabase
      .from("payments")
      .select("amount, confirmed_at")
      .eq("status", "confirmed")
      .gte("confirmed_at", thirtyDaysAgo),
  ]);

  const monthlyRevenue = (revenueData || []).reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  );

  const totalRevenue = (totalRevenueData || []).reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  );

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

  // --- Chart data transformations ---

  // Revenue by day (last 30 days)
  const revenueByDayMap: Record<string, number> = {};
  for (const p of dailyRevenue || []) {
    const date = new Date(p.confirmed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    revenueByDayMap[date] = (revenueByDayMap[date] || 0) + p.amount;
  }
  const revenueByDay = Object.entries(revenueByDayMap)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Subscriptions by package
  const subCounts: Record<string, number> = {};
  for (const s of activeSubscriptions || []) {
    const name = (s.packages as { name: string } | null)?.name || "Unknown";
    subCounts[name] = (subCounts[name] || 0) + 1;
  }
  const subsByPackage = Object.entries(subCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Players by level
  const levelCounts: Record<string, number> = {};
  for (const p of playerLevels || []) {
    const level = p.playing_level || "unknown";
    levelCounts[level] = (levelCounts[level] || 0) + 1;
  }
  const playersByLevelData = Object.entries(levelCounts).map(([level, count]) => ({ level, count }));

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Active Players"
          value={playerCount ?? 0}
          accentColor="bg-primary"
          icon={<Users className="w-5 h-5" />}
        />
        <RevenueCard
          label={`Revenue (${currentMonth})`}
          value={`${monthlyRevenue.toLocaleString()} EGP`}
          subtitle={`All Time: ${totalRevenue.toLocaleString()} EGP`}
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

      {/* Charts */}
      <DashboardCharts
        revenueByDay={revenueByDay}
        subsByPackage={subsByPackage}
        playersByLevel={playersByLevelData}
      />

      {/* Two column grid */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Pending Payments */}
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

        {/* Recent Registrations */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              Recent Registrations
            </h2>
            <Link
              href="/admin/players"
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {recentPlayers && recentPlayers.length > 0 ? (
            <div className="space-y-3">
              {recentPlayers.map((player: Record<string, unknown>) => {
                const subs = player.subscriptions as { status: string }[] | null;
                const hasActive = subs?.some((s) => s.status === "active");
                const hasPending = subs?.some((s) => s.status === "pending");
                return (
                  <Link
                    key={player.id as string}
                    href={`/admin/players?highlight=${player.id as string}`}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 -mx-2 px-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {player.first_name as string} {player.last_name as string}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">
                        {(player.playing_level as string) || "No level"} &middot;{" "}
                        {new Date(player.created_at as string).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={hasActive ? "success" : hasPending ? "warning" : "neutral"}
                    >
                      {hasActive ? "Active" : hasPending ? "Pending" : "New"}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">
              No players yet
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
