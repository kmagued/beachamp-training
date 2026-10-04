import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { getLevelLabel } from "@/lib/config/branding";
import { TrendingUp, MessageSquare, Award, Trophy } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { placeLabel } from "@/lib/king-of-court/awards";
import { formatMonth } from "@/lib/king-of-court/format";
import { loadLatestAchievements, loadStreak } from "@/lib/badges/load";
import { TIERS } from "@/lib/badges/config";
import { badgeDescription } from "@/lib/badges/words";
import { BadgeMedallion } from "@/components/achievements/badge-icon";
import { BadgeProgressCard } from "@/components/achievements/badge-progress-card";
import { CreditsCard } from "@/components/achievements/credits-card";
import { StreakCard } from "@/components/achievements/streak-card";
import type { Subscription } from "@/types/database";
import { PlanCard } from "./_components/plan-card";
import { RenewalBanner } from "./_components/renewal-banner";
import { PrivateSessionsCard } from "./_components/private-sessions-card";
import { loadPlayerPrivateSessions } from "@/lib/private-sessions/load";
import { newestPlanSubscription } from "@/lib/private-sessions/payment";
import { cairoToday } from "@/lib/utils/cairo-time";

export default async function PlayerDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // The plan card shows the newest subscription that isn't a private session's payment (those
  // show on the private sessions card). Picked here, not filtered in the query, so the card
  // still works on a database that doesn't have private_session_id yet.
  const { data: activeSubs } = await supabase
    .from("subscriptions")
    .select("*, packages(*)")
    .eq("player_id", currentUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20) as { data: (Subscription & { packages: { name: string; session_count: number } })[] | null };
  const subscription = newestPlanSubscription(activeSubs ?? []);

  const { data: pendingSubs } = await supabase
    .from("subscriptions")
    .select("*, packages(*)")
    .eq("player_id", currentUser.id)
    .in("status", ["pending", "pending_payment"])
    .order("created_at", { ascending: false })
    .limit(20) as { data: (Subscription & { packages: { name: string } })[] | null };
  const pendingSubscription = newestPlanSubscription(pendingSubs ?? []);

  // For an unpaid (pending_payment) sub, load its payment so the player can
  // upload an Instapay screenshot right from the dashboard.
  let pendingPayment: { id: string; amount: number; screenshot_url: string | null } | null = null;
  if (pendingSubscription?.status === "pending_payment") {
    const { data } = await supabase
      .from("payments")
      .select("id, amount, screenshot_url")
      .eq("subscription_id", pendingSubscription.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    pendingPayment = data;
  }

  // Show the upload card when there's an unpaid attended session and no active
  // sub with sessions left (an exhausted-but-active multi-session sub stays
  // 'active', so it must not hide the payment the player still owes).
  const hasUsableActiveSub = !!subscription && subscription.sessions_remaining > 0;
  const showPaymentCard =
    !hasUsableActiveSub && pendingSubscription?.status === "pending_payment" && !!pendingPayment;

  // Read with the service role (a partner can't read the payer's payment), limited to this player
  const privateSessions = await loadPlayerPrivateSessions(createAdminClient(), currentUser.id, cairoToday());

  const { data: latestFeedback } = await supabase
    .from("feedback")
    .select("*, coach:profiles!feedback_coach_id_fkey(first_name, last_name)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Neither throws: the dashboard renders without these if they can't be read
  const [{ items: latestAchievements, badges, creditBalance }, streak] = await Promise.all([
    loadLatestAchievements(supabase, currentUser.id, 3),
    loadStreak(supabase, currentUser.id),
  ]);
  const paidTiers = badges.flatMap((b) => b.tiers).filter((t) => (t.credits_paid ?? 0) > 0).length;

  let daysRemaining: number | null = null;
  let isExpired = false;
  let isExpiringSoon = false;
  if (subscription?.end_date) {
    const end = new Date(subscription.end_date);
    const now = new Date();
    daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    isExpired = daysRemaining <= 0;
    isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;

    if (!isExpired && !isExpiringSoon && subscription.start_date) {
      const packageDays = Math.max(1, Math.ceil(
        (end.getTime() - new Date(subscription.start_date).getTime()) / (1000 * 60 * 60 * 24)
      ));
      const timeRatio = daysRemaining / packageDays;
      if (timeRatio <= 0.3) isExpiringSoon = true;
    }
  }
  const sessionsRatio = subscription && subscription.sessions_total > 0
    ? subscription.sessions_remaining / subscription.sessions_total : 1;
  const sessionsLow = !!subscription && sessionsRatio <= 0.3;
  const sessionsOut = !!subscription && subscription.sessions_remaining <= 0;

  // At most one renew prompt, the most urgent
  const renewal: { tone: "danger" | "warning"; title: string; body: string } | null = isExpired
    ? {
        tone: "danger",
        title: "Your subscription has expired",
        body: "Renew your subscription to continue attending training sessions.",
      }
    : sessionsOut
    ? {
        tone: "danger",
        title: "You have no sessions remaining",
        body: "Renew your subscription to continue training.",
      }
    : isExpiringSoon || sessionsLow
    ? {
        tone: isExpiringSoon ? "danger" : "warning",
        title: isExpiringSoon && sessionsLow
          ? `Your subscription expires in ${daysRemaining} days and you have ${subscription?.sessions_remaining} sessions left`
          : isExpiringSoon
          ? `Your subscription expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
          : `You have only ${subscription?.sessions_remaining} session${subscription?.sessions_remaining === 1 ? "" : "s"} remaining`,
        body: "Renew now to avoid interruption to your training.",
      }
    : null;

  const level = getLevelLabel(currentUser.profile.playing_level);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-primary-900">
          Welcome back, {currentUser.profile.first_name}!
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-primary-700/60 text-sm">
            Here&apos;s an overview of your training progress.
          </p>
          {level && (
            <Badge variant="info" className="gap-1">
              <TrendingUp className="w-3 h-3" />
              {level}
            </Badge>
          )}
        </div>
      </div>

      {renewal && <RenewalBanner {...renewal} />}

      {/* Sessions left first, then the streak and credits that keep players coming back */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <PlanCard
          className="sm:col-span-2 lg:col-span-1"
          subscription={subscription}
          pendingSubscription={pendingSubscription}
          pendingPayment={showPaymentCard ? pendingPayment : null}
          state={{ daysRemaining, isExpired, isExpiringSoon, sessionsLow, sessionsOut }}
        />
        <StreakCard streak={streak} />
        <CreditsCard balance={creditBalance} paidTiers={paidTiers} />
      </div>
      <PrivateSessionsCard data={privateSessions} />
      {badges.length > 0 && <BadgeProgressCard badges={badges} />}

      <div className={cn("grid gap-4 sm:gap-6", latestAchievements.length > 0 && "lg:grid-cols-2")}>
        {/* Latest Feedback */}
        <Card>
          <h2 className="font-display text-xl tracking-wide text-primary-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary-700/50" />
            Latest Feedback
          </h2>
          {latestFeedback ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-secondary/15 flex items-center justify-center text-[11px] font-bold text-secondary-dark">
                  {(latestFeedback.coach?.first_name?.[0] || "C")}
                  {(latestFeedback.coach?.last_name?.[0] || "")}
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary-900">
                    {latestFeedback.coach?.first_name} {latestFeedback.coach?.last_name}
                  </p>
                  <p className="text-[11px] text-primary-700/50">
                    {formatDate(latestFeedback.created_at)}
                  </p>
                </div>
              </div>
              {latestFeedback.comment && (
                <p className="text-sm text-primary-800/80 leading-relaxed">
                  {latestFeedback.comment}
                </p>
              )}
              <Link
                href="/player/feedback"
                className="text-sm font-semibold text-primary-800 hover:text-primary-900 mt-3 inline-block"
              >
                View all feedback →
              </Link>
            </div>
          ) : (
            <EmptyState
              icon={<MessageSquare className="w-10 h-10" />}
              title="No Feedback Yet"
              description="Your coaches will leave feedback after training sessions."
            />
          )}
        </Card>
        {/* Achievements: only for players who have an award or a badge */}
        {latestAchievements.length > 0 && (
          <Card>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display text-xl tracking-wide text-primary-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-primary-700/50" />
                Achievements
              </h2>
              <Link
                href="/player/achievements"
                className="text-sm font-semibold text-primary-800 hover:text-primary-900 whitespace-nowrap"
              >
                View all →
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {latestAchievements.map((item) =>
                item.kind === "award" ? (
                  <div key={`award-${item.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        item.award.place === 1 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                      )}
                    >
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary-900">
                        {placeLabel(item.award.place)} · {formatMonth(item.award.month, "long")}
                      </p>
                      <p className="text-xs text-primary-700/60 truncate">
                        {item.award.group_name} · {item.award.points} pts
                      </p>
                    </div>
                  </div>
                ) : (
                  <div key={`badge-${item.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <BadgeMedallion icon={item.badge.icon} tier={item.tier.tier} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-primary-900">
                        {item.badge.name} · {TIERS[item.tier.tier].label}
                      </p>
                      <p className="text-xs text-primary-700/60 truncate">
                        {badgeDescription(item.badge.measure, item.tier.threshold)}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
