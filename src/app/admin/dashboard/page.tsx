import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import { Button, Card } from "@/components/ui";
import type { Profile } from "@/types/database";

export default async function AdminDashboard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single() as { data: Profile | null };

  // Quick stats
  const { count: playerCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "player")
    .eq("is_active", true) as { count: number | null };

  const { count: pendingPayments } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending") as { count: number | null };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Admin Dashboard
            </h1>
            <p className="text-slate-500 text-sm">
              Welcome, {profile?.first_name}
            </p>
          </div>
          <form action={logout}>
            <Button type="submit" variant="secondary" size="sm">
              Sign Out
            </Button>
          </form>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="p-5">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Active Players
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-1">
              {playerCount ?? 0}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Pending Payments
            </div>
            <div className="text-3xl font-bold text-amber-500 mt-1">
              {pendingPayments ?? 0}
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Your Role
            </div>
            <div className="text-3xl font-bold text-red-500 mt-1 capitalize">
              {profile?.role}
            </div>
          </Card>
        </div>

        <p className="text-slate-400 text-xs text-center">
          Full admin portal UI coming in Phase 1 development.
        </p>
      </div>
    </div>
  );
}
