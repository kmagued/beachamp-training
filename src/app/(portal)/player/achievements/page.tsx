import Link from "next/link";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { Card, EmptyState } from "@/components/ui";
import { AwardCard } from "@/components/achievements/award-card";
import { loadPlayerAwards } from "@/lib/king-of-court/awards-load";

export default async function PlayerAchievementsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const supabase = await createClient();
  const awards = await loadPlayerAwards(supabase, currentUser.id);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Achievements</h1>
        <p className="text-slate-500 text-sm">Your monthly leaderboard awards.</p>
      </div>

      {awards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Award className="w-10 h-10" />}
            title="No achievements yet"
            description="Finish in the top 2 of your group's monthly leaderboard to earn one."
            action={
              <Link
                href="/player/leaderboard"
                className="text-sm font-semibold text-primary-800 hover:text-primary-900"
              >
                View the leaderboard →
              </Link>
            }
          />
        </Card>
      ) : (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Monthly awards</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {awards.map((award) => (
              <AwardCard key={award.id} award={award} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
