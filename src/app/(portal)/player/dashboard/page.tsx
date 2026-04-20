import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { StatCard, Card, Badge, EmptyState } from "@/components/ui";
import {
  CalendarDays,
  Clock,
  Package,
  TrendingUp,
  MessageSquare,
  Star,
  AlertTriangle,
} from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import type { Subscription } from "@/types/database";

export default async function PlayerDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, packages(*)")
    .eq("player_id", currentUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: (Subscription & { packages: { name: string; session_count: number } }) | null };

  const { data: pendingSubscription } = await supabase
    .from("subscriptions")
    .select("*, packages(*)")
    .eq("player_id", currentUser.id)
    .in("status", ["pending", "pending_payment"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: (Subscription & { packages: { name: string } }) | null };

  const { data: latestFeedback } = await supabase
    .from("feedback")
    .select("*, coach:profiles!feedback_coach_id_fkey(first_name, last_name)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let daysRemaining: number | null = null;
  let isExpired = false;
  let isExpiringSoon = false;
  let expiringBySessions = false;
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
  const sessionsLow = subscription && sessionsRatio <= 0.3;
  const sessionsOut = subscription && subscription.sessions_remaining <= 0;
  if (sessionsLow && !isExpired) expiringBySessions = true;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-primary-900">
          Welcome back, {currentUser.profile.first_name}!
        </h1>
        <p className="text-primary-700/60 text-sm mt-1">
          Here&apos;s an overview of your training progress.
        </p>
      </div>

      {/* Stat cards */}
      {subscription ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard
            label="Sessions Remaining"
            value={subscription.sessions_remaining}
            subtitle={`of ${subscription.sessions_total} total`}
            accentColor={sessionsOut ? "bg-danger" : sessionsLow ? "bg-accent" : "bg-primary-800"}
            icon={<CalendarDays className="w-5 h-5" />}
          />
          <StatCard
            label="Valid Until"
            value={
              isExpired ? "Expired" :
              subscription.end_date
                ? formatDate(subscription.end_date)
                : "—"
            }
            subtitle={daysRemaining !== null && daysRemaining > 0 ? `${daysRemaining} days remaining` : undefined}
            accentColor={isExpired ? "bg-danger" : isExpiringSoon ? "bg-accent" : "bg-secondary"}
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            label="Package"
            value={subscription.packages?.name || "—"}
            accentColor="bg-primary-800"
            icon={<Package className="w-5 h-5" />}
          />
          <StatCard
            label="Level"
            value={currentUser.profile.playing_level || "—"}
            accentColor="bg-secondary-dark"
            icon={<TrendingUp className="w-5 h-5" />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard label="Sessions Remaining" value="—" accentColor="bg-primary-200" icon={<CalendarDays className="w-5 h-5" />} />
          <StatCard label="Valid Until" value="—" accentColor="bg-primary-200" icon={<Clock className="w-5 h-5" />} />
          <StatCard label="Package" value="None" accentColor="bg-primary-200" icon={<Package className="w-5 h-5" />} />
          <StatCard
            label="Level"
            value={currentUser.profile.playing_level || "—"}
            accentColor="bg-secondary-dark"
            icon={<TrendingUp className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Two column grid */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
        {/* Subscription Status */}
        <Card>
          <h2 className="font-display text-xl tracking-wide text-primary-900 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-primary-700/50" />
            Subscription Status
          </h2>
          {subscription ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-primary-700/60">Status</span>
                <Badge variant="success">Active</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-primary-700/60">Package</span>
                <span className="text-sm font-semibold text-primary-900">{subscription.packages?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-primary-700/60">Sessions</span>
                <span className="text-sm font-semibold text-primary-900">
                  {subscription.sessions_total === 1 ? subscription.sessions_remaining : `${subscription.sessions_remaining} / ${subscription.sessions_total}`}
                </span>
              </div>
              {subscription.start_date && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-primary-700/60">Started</span>
                  <span className="text-sm text-primary-800">
                    {formatDate(subscription.start_date)}
                  </span>
                </div>
              )}
              <Link
                href="/player/subscriptions"
                className="block text-center text-sm font-semibold text-primary-800 hover:text-primary-900 pt-2"
              >
                View Details →
              </Link>
            </div>
          ) : pendingSubscription ? (
            <div className="text-center py-4">
              <Badge variant="warning" className="mb-2">
                {pendingSubscription.status === "pending_payment" ? "Payment Required" : "Pending Confirmation"}
              </Badge>
              <p className="text-sm text-primary-700/70 mt-2">
                {pendingSubscription.status === "pending_payment"
                  ? `You have an unpaid session for ${pendingSubscription.packages?.name}. Please make your payment.`
                  : `Your payment for ${pendingSubscription.packages?.name} is being reviewed.`}
              </p>
              {pendingSubscription.status === "pending_payment" && (
                <Link
                  href="/player/subscribe"
                  className="text-sm font-semibold text-primary-800 hover:text-primary-900 mt-2 inline-block"
                >
                  Pay Now →
                </Link>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Package className="w-10 h-10" />}
              title="No Active Subscription"
              description="Subscribe to a training package to start attending sessions."
              action={
                <Link
                  href="/player/packages"
                  className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Browse Packages
                </Link>
              }
            />
          )}
        </Card>

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
                    {formatDate(latestFeedback.session_date)}
                  </p>
                </div>
              </div>
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < latestFeedback.rating
                        ? "text-accent fill-accent"
                        : "text-primary-200"
                    }`}
                  />
                ))}
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
      </div>

      {/* Renewal / Warning Banners */}
      {isExpired && (
        <div className="bg-danger/5 border border-danger/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-danger">
              Your subscription has expired
            </p>
            <p className="text-xs text-danger/80 mt-0.5">
              Renew your subscription to continue attending training sessions.
            </p>
          </div>
          <Link
            href="/player/subscribe"
            className="text-sm font-semibold text-danger hover:text-danger/80 whitespace-nowrap"
          >
            Renew Now →
          </Link>
        </div>
      )}
      {!isExpired && sessionsOut && (
        <div className="bg-danger/5 border border-danger/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-danger">
              You have no sessions remaining
            </p>
            <p className="text-xs text-danger/80 mt-0.5">
              Renew your subscription to continue training.
            </p>
          </div>
          <Link
            href="/player/subscribe"
            className="text-sm font-semibold text-danger hover:text-danger/80 whitespace-nowrap"
          >
            Renew Now →
          </Link>
        </div>
      )}
      {!isExpired && !sessionsOut && (isExpiringSoon || sessionsLow) && (
        <div className={`${isExpiringSoon ? "bg-danger/5 border-danger/30" : "bg-accent/10 border-accent/40"} border rounded-xl p-4 flex items-center gap-3`}>
          <AlertTriangle className={`w-5 h-5 ${isExpiringSoon ? "text-danger" : "text-accent-600"} flex-shrink-0`} />
          <div className="flex-1">
            <p className={`text-sm font-semibold ${isExpiringSoon ? "text-danger" : "text-accent-700"}`}>
              {isExpiringSoon && sessionsLow
                ? `Your subscription expires in ${daysRemaining} days and you have ${subscription?.sessions_remaining} sessions left`
                : isExpiringSoon
                ? `Your subscription expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
                : `You have only ${subscription?.sessions_remaining} session${subscription?.sessions_remaining === 1 ? "" : "s"} remaining`}
            </p>
            <p className={`text-xs ${isExpiringSoon ? "text-danger/80" : "text-accent-700/80"} mt-0.5`}>
              Renew now to avoid interruption to your training.
            </p>
          </div>
          <Link
            href="/player/subscribe"
            className={`text-sm font-semibold ${isExpiringSoon ? "text-danger hover:text-danger/80" : "text-accent-700 hover:text-accent-600"} whitespace-nowrap`}
          >
            Renew Now →
          </Link>
        </div>
      )}
      {!isExpired && !sessionsOut && !isExpiringSoon && !sessionsLow && expiringBySessions && (
        <div className="bg-accent/10 border border-accent/40 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-accent-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-accent-700">
              Your sessions are running low ({subscription?.sessions_remaining} remaining)
            </p>
            <p className="text-xs text-accent-700/80 mt-0.5">
              Renew now to avoid interruption to your training.
            </p>
          </div>
          <Link
            href="/player/subscribe"
            className="text-sm font-semibold text-accent-700 hover:text-accent-600 whitespace-nowrap"
          >
            Renew Now →
          </Link>
        </div>
      )}
    </div>
  );
}
