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
import type { Subscription } from "@/types/database";

export default async function PlayerDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Fetch active subscription with package info
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, packages(*)")
    .eq("player_id", currentUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: (Subscription & { packages: { name: string; session_count: number } }) | null };

  // Check for pending subscription
  const { data: pendingSubscription } = await supabase
    .from("subscriptions")
    .select("*, packages(*)")
    .eq("player_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: (Subscription & { packages: { name: string } }) | null };

  // Fetch latest feedback
  const { data: latestFeedback } = await supabase
    .from("feedback")
    .select("*, coach:profiles!feedback_coach_id_fkey(first_name, last_name)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Calculate days remaining
  let daysRemaining: number | null = null;
  let expiringWithin30 = false;
  if (subscription?.end_date) {
    const end = new Date(subscription.end_date);
    const now = new Date();
    daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expiringWithin30 = daysRemaining <= 30 && daysRemaining > 0;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          Welcome back, {currentUser.profile.first_name}!
        </h1>
        <p className="text-slate-500 text-sm">
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
            accentColor="bg-primary"
            icon={<CalendarDays className="w-5 h-5" />}
          />
          <StatCard
            label="Valid Until"
            value={
              subscription.end_date
                ? new Date(subscription.end_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "—"
            }
            subtitle={daysRemaining !== null ? `${daysRemaining} days remaining` : undefined}
            accentColor={expiringWithin30 ? "bg-amber-500" : "bg-emerald-500"}
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            label="Package"
            value={subscription.packages?.name || "—"}
            accentColor="bg-primary"
            icon={<Package className="w-5 h-5" />}
          />
          <StatCard
            label="Level"
            value={currentUser.profile.playing_level || "—"}
            accentColor="bg-violet-500"
            icon={<TrendingUp className="w-5 h-5" />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard label="Sessions Remaining" value="—" accentColor="bg-slate-300" icon={<CalendarDays className="w-5 h-5" />} />
          <StatCard label="Valid Until" value="—" accentColor="bg-slate-300" icon={<Clock className="w-5 h-5" />} />
          <StatCard label="Package" value="None" accentColor="bg-slate-300" icon={<Package className="w-5 h-5" />} />
          <StatCard
            label="Level"
            value={currentUser.profile.playing_level || "—"}
            accentColor="bg-violet-500"
            icon={<TrendingUp className="w-5 h-5" />}
          />
        </div>
      )}

      {/* Two column grid */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
        {/* Subscription Status */}
        <Card>
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" />
            Subscription Status
          </h2>
          {subscription ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Status</span>
                <Badge variant="success">Active</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Package</span>
                <span className="text-sm font-medium text-slate-900">{subscription.packages?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Sessions</span>
                <span className="text-sm font-medium text-slate-900">
                  {subscription.sessions_remaining} / {subscription.sessions_total}
                </span>
              </div>
              {subscription.start_date && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Started</span>
                  <span className="text-sm text-slate-700">
                    {new Date(subscription.start_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              <Link
                href="/player/subscriptions"
                className="block text-center text-sm font-medium text-primary hover:underline pt-2"
              >
                View Details
              </Link>
            </div>
          ) : pendingSubscription ? (
            <div className="text-center py-4">
              <Badge variant="warning" className="mb-2">Pending Confirmation</Badge>
              <p className="text-sm text-slate-500 mt-2">
                Your payment for {pendingSubscription.packages?.name} is being reviewed.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={<Package className="w-10 h-10" />}
              title="No Active Subscription"
              description="Subscribe to a training package to start attending sessions."
              action={
                <Link
                  href="/player/renew"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Browse Packages
                </Link>
              }
            />
          )}
        </Card>

        {/* Latest Feedback */}
        <Card>
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            Latest Feedback
          </h2>
          {latestFeedback ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-brand-coach/10 flex items-center justify-center text-[10px] font-bold text-brand-coach">
                  {(latestFeedback.coach?.first_name?.[0] || "C")}
                  {(latestFeedback.coach?.last_name?.[0] || "")}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {latestFeedback.coach?.first_name} {latestFeedback.coach?.last_name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(latestFeedback.session_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-0.5 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < latestFeedback.rating
                        ? "text-amber-400 fill-amber-400"
                        : "text-slate-200"
                    }`}
                  />
                ))}
              </div>
              {latestFeedback.comment && (
                <p className="text-sm text-slate-600 leading-relaxed">
                  {latestFeedback.comment}
                </p>
              )}
              <Link
                href="/player/feedback"
                className="text-sm font-medium text-primary hover:underline mt-3 inline-block"
              >
                View all feedback
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

      {/* Renewal Banner */}
      {expiringWithin30 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Your subscription expires in {daysRemaining} days
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Renew now to avoid interruption to your training.
            </p>
          </div>
          <Link
            href="/player/renew"
            className="text-sm font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap"
          >
            Renew Now
          </Link>
        </div>
      )}
    </div>
  );
}
