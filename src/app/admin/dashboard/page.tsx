import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "@/app/_auth/actions";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Quick stats
  const { count: playerCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "player")
    .eq("is_active", true);

  const { count: pendingPayments } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

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
            <button
              type="submit"
              className="text-sm text-slate-500 hover:text-slate-700 border border-slate-300 px-4 py-2 rounded-lg"
            >
              Sign Out
            </button>
          </form>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Active Players
            </div>
            <div className="text-3xl font-bold text-slate-900 mt-1">
              {playerCount ?? 0}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Pending Payments
            </div>
            <div className="text-3xl font-bold text-amber-500 mt-1">
              {pendingPayments ?? 0}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Your Role
            </div>
            <div className="text-3xl font-bold text-red-500 mt-1 capitalize">
              {profile?.role}
            </div>
          </div>
        </div>

        <p className="text-slate-400 text-xs text-center">
          Full admin portal UI coming in Phase 1 development.
        </p>
      </div>
    </div>
  );
}
