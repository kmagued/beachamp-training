import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "@/app/_auth/actions";

export default async function PlayerDashboard() {
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome back, {profile?.first_name}!
            </h1>
            <p className="text-slate-500 text-sm">Player Dashboard</p>
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

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Your Profile</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900">
                {profile?.first_name} {profile?.last_name}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{profile?.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium text-slate-900">
                {profile?.phone || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Level</dt>
              <dd className="font-medium text-slate-900 capitalize">
                {profile?.playing_level || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Area</dt>
              <dd className="font-medium text-slate-900">
                {profile?.area || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium text-slate-900 capitalize">
                {profile?.role}
              </dd>
            </div>
          </dl>
        </div>

        <p className="text-slate-400 text-xs mt-8 text-center">
          Full dashboard UI coming in Phase 1 development.
        </p>
      </div>
    </div>
  );
}
