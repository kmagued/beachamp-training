import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { StatCard, Card, Badge } from "@/components/ui";
import { Users, CreditCard, DollarSign, CalendarDays } from "lucide-react";

export default async function AdminDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Stats queries in parallel
  const [
    { count: playerCount },
    { count: pendingPayments },
    { data: revenueData },
    { data: pendingPaymentsList },
    { data: recentPlayers },
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
  ]);

  const monthlyRevenue = (revenueData || []).reduce(
    (sum: number, p: { amount: number }) => sum + p.amount,
    0
  );

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });

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
        <StatCard
          label={`Revenue (${currentMonth})`}
          value={`${monthlyRevenue.toLocaleString()} EGP`}
          accentColor="bg-emerald-500"
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatCard
          label="Pending Payments"
          value={pendingPayments ?? 0}
          accentColor={pendingPayments ? "bg-amber-500" : "bg-slate-300"}
          icon={<CreditCard className="w-5 h-5" />}
        />
        <StatCard
          label="Sessions Today"
          value="—"
          subtitle="Coming in Phase 2"
          accentColor="bg-slate-300"
          icon={<CalendarDays className="w-5 h-5" />}
        />
      </div>

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
              href="/admin/payments"
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
                  <div
                    key={payment.id as string}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
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
                  </div>
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
                  <div
                    key={player.id as string}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
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
                  </div>
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
