import Link from "next/link";
import { Package } from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import type { Subscription } from "@/types/database";
import { PendingPaymentCard } from "./pending-payment-card";

export interface PlanState {
  daysRemaining: number | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  sessionsLow: boolean;
  sessionsOut: boolean;
}

interface PlanCardProps {
  subscription: (Subscription & { packages: { name: string } | null }) | null;
  pendingSubscription: (Subscription & { packages: { name: string } | null }) | null;
  /** Set when the player owes for an attended session and has no usable active sub */
  pendingPayment: { id: string; amount: number; screenshot_url: string | null } | null;
  state: PlanState;
  className?: string;
}

/** The dashboard's subscription at a glance: sessions left first, since that's what players check */
export function PlanCard({ subscription, pendingSubscription, pendingPayment, state, className }: PlanCardProps) {
  const { daysRemaining, isExpired, isExpiringSoon, sessionsLow, sessionsOut } = state;

  const status = pendingPayment || !subscription
    ? null
    : isExpired
    ? <Badge variant="danger">Expired</Badge>
    : sessionsOut
    ? <Badge variant="neutral">Completed</Badge>
    : <Badge variant="success">Active</Badge>;

  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-wide text-primary-900 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary-700/50" />
          Your plan
        </h2>
        {status}
      </div>

      {pendingPayment ? (
        <div className="mt-4">
          <PendingPaymentCard
            paymentId={pendingPayment.id}
            packageName={pendingSubscription?.packages?.name ?? "your package"}
            amount={pendingPayment.amount}
            hasScreenshot={!!pendingPayment.screenshot_url}
          />
        </div>
      ) : subscription ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={cn("font-display text-5xl leading-none", sessionsOut ? "text-danger" : "text-primary-900")}>
              {subscription.sessions_remaining}
            </span>
            <span className="text-sm text-slate-500">
              {subscription.sessions_total > 1
                ? `of ${subscription.sessions_total} sessions left`
                : `${subscription.sessions_remaining === 1 ? "session" : "sessions"} left`}
            </span>
          </div>
          {subscription.sessions_total > 1 && (
            <div
              role="progressbar"
              aria-label="Sessions left"
              aria-valuemin={0}
              aria-valuemax={subscription.sessions_total}
              aria-valuenow={subscription.sessions_remaining}
              className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden"
            >
              <div
                className={cn("h-full rounded-full", sessionsLow ? "bg-accent-500" : "bg-primary-800")}
                style={{ width: `${Math.max(0, (subscription.sessions_remaining / subscription.sessions_total) * 100)}%` }}
              />
            </div>
          )}

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-primary-700/60 shrink-0">Package</dt>
              <dd className="font-semibold text-primary-900 text-right truncate">{subscription.packages?.name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-primary-700/60 shrink-0">Valid until</dt>
              <dd className="text-right">
                <span
                  className={cn(
                    isExpired ? "font-semibold text-danger" : isExpiringSoon ? "font-semibold text-accent-700" : "text-primary-800",
                  )}
                >
                  {isExpired ? "Expired" : subscription.end_date ? formatDate(subscription.end_date) : "—"}
                </span>
                {daysRemaining !== null && daysRemaining > 0 && (
                  <span className="block text-xs text-primary-700/50">
                    {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <Link
            href="/player/subscriptions"
            className="mt-auto pt-4 text-sm font-semibold text-primary-800 hover:text-primary-900"
          >
            View details →
          </Link>
        </>
      ) : pendingSubscription ? (
        <div className="text-center py-6">
          <Badge variant="warning" className="mb-2">
            {pendingSubscription.status === "pending_payment" ? "Payment Required" : "Pending Confirmation"}
          </Badge>
          <p className="text-sm text-primary-700/70 mt-2">
            {pendingSubscription.status === "pending_payment"
              ? `You have an unpaid session for ${pendingSubscription.packages?.name}.`
              : `Your payment for ${pendingSubscription.packages?.name} is being reviewed.`}
          </p>
        </div>
      ) : (
        <EmptyState
          className="py-8"
          icon={<Package className="w-10 h-10" />}
          title="No Active Subscription"
          description="Subscribe to a training package to start attending sessions."
          action={
            <Link
              href="/player/packages"
              className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              Browse Packages
            </Link>
          }
        />
      )}
    </Card>
  );
}
