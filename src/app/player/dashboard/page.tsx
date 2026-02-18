import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import { Button, Card } from "@/components/ui";
import type { Profile } from "@/types/database";

export default async function PlayerDashboard() {
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
            <Button type="submit" variant="secondary" size="sm">
              Sign Out
            </Button>
          </form>
        </div>

        <Card>
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
        </Card>

        <p className="text-slate-400 text-xs mt-8 text-center">
          Full dashboard UI coming in Phase 1 development.
        </p>
      </div>
    </div>
  );
}
