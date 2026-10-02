import Link from "next/link";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { Card, EmptyState } from "@/components/ui";
import { AchievementStat } from "@/components/achievements/achievement-stat";
import { AwardCard } from "@/components/achievements/award-card";
import { BadgeTile } from "@/components/achievements/badge-tile";
import { ShareButton } from "@/components/achievements/share-button";
import { loadPlayerAchievements } from "@/lib/badges/load";
import { badgeDescription, badgesDetail, creditsDetail } from "@/lib/badges/words";

function SectionHeading({ children }: { children: string }) {
  return <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</h2>;
}

export default async function PlayerAchievementsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const supabase = await createClient();
  const { awards, badges, creditBalance, sessionsAttended } = await loadPlayerAchievements(supabase, currentUser.id);
  const earned = badges.filter((b) => b.earned_on !== null);
  const nothingYet = awards.length === 0 && earned.length === 0;
  // The name on the share card
  const { first_name, last_name } = currentUser.profile;
  const playerName = `${first_name ?? ""} ${last_name ?? ""}`.trim() || "Beachamp player";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Achievements</h1>
        <p className="text-slate-500 text-sm">Everything you&apos;ve won: monthly awards and badges.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <AchievementStat highlight label="Awards" value={awards.length} detail="Monthly leaderboard finishes" />
        {badges.length > 0 && (
          <>
            <AchievementStat
              label="Badges earned"
              value={`${earned.length} of ${badges.length}`}
              detail={badgesDetail(earned.length, badges.length)}
            />
            <AchievementStat label="Beachamp Credits" value={creditBalance} detail={creditsDetail(earned.length)} />
          </>
        )}
        <AchievementStat label="Sessions attended" value={sessionsAttended} detail="All time" />
      </div>

      {nothingYet && (
        <Card className="mb-8">
          <EmptyState
            icon={<Award className="w-10 h-10" />}
            title="No achievements yet"
            description={
              badges.length > 0
                ? "Finish in the top 2 of your group's monthly leaderboard, or unlock a badge below."
                : "Finish in the top 2 of your group's monthly leaderboard to earn one."
            }
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
      )}

      {awards.length > 0 && (
        <section className="mb-8">
          <SectionHeading>Monthly awards</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {awards.map((award) => (
              <AwardCard
                key={award.id}
                award={award}
                share={
                  <ShareButton
                    look={award.place === 1 ? "gold" : "outline"}
                    playerId={currentUser.id}
                    subject={{
                      kind: "award",
                      place: award.place,
                      groupName: award.group_name,
                      month: award.month,
                      points: award.points,
                      sessions: award.sessions,
                      playerName,
                    }}
                  />
                }
              />
            ))}
          </div>
        </section>
      )}

      {badges.length > 0 && (
        <section>
          <SectionHeading>Badges</SectionHeading>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {badges.map((badge) => (
              <BadgeTile
                key={badge.id}
                badge={badge}
                share={
                  badge.earned_on && (
                    <ShareButton
                      look="compact"
                      playerId={currentUser.id}
                      subject={{
                        kind: "badge",
                        name: badge.name,
                        icon: badge.icon,
                        description: badgeDescription(badge.measure, badge.threshold),
                        earnedOn: badge.earned_on,
                        playerName,
                      }}
                    />
                  )
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
