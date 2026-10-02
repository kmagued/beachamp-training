import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { Package, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import type { Subscription } from "@/types/database";

interface SubWithPackage extends Subscription {
  packages: { name: string; session_count: number } | null;
  payments: { amount: number; status: string; rejection_reason: string | null; created_at: string }[] | null;
}

/** What the player paid (or owes) for a subscription: its confirmed payment, else the latest one.
 *  Not the package's price — that is today's price and changes over time, and promo codes discount it.
 *  A subscription with no payment at all was fully covered by a promo code. */
function formatPaidPrice(sub: SubWithPackage) {
  const payments = sub.payments ?? [];
  const payment =
    payments.find((p) => p.status === "confirmed") ??
    [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!payment) return sub.promo_code_id ? "Free" : "—";
  return `${Number(payment.amount).toLocaleString("en-US")} EGP`;
}

export default async function PlayerSubscriptionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: subscriptions } = (await supabase
    .from("subscriptions")
    .select("*, packages(name, session_count), payments(amount, status, rejection_reason, created_at)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false })) as { data: SubWithPackage[] | null };

  const subs = subscriptions ?? [];

  function getDisplayStatus(sub: SubWithPackage) {
    const rejectedPayment = sub.payments?.find((p) => p.status === "rejected");
    if (sub.status === "cancelled" && rejectedPayment) {
      return { label: "Rejected", variant: "danger" as const, reason: rejectedPayment.rejection_reason };
    }
    // Depleted active sub (e.g. single-session that's been used) → "Completed"
    if (sub.status === "active" && sub.sessions_remaining <= 0) {
      return { label: "Completed", variant: "neutral" as const, reason: null };
    }
    // Active subscription with future start_date → "Upcoming"
    if (sub.status === "active" && sub.start_date && new Date(sub.start_date) > new Date()) {
      return { label: "Upcoming", variant: "info" as const, reason: null };
    }
    switch (sub.status) {
      case "active":
        return { label: "Active", variant: "success" as const, reason: null };
      case "pending":
        return { label: "Pending Confirmation", variant: "warning" as const, reason: null };
      case "pending_payment":
        return { label: "Pending Payment", variant: "warning" as const, reason: null };
      case "expired":
        return { label: "Expired", variant: "neutral" as const, reason: null };
      case "cancelled":
        return { label: "Cancelled", variant: "danger" as const, reason: null };
      case "frozen":
        return { label: "Frozen", variant: "info" as const, reason: null };
      default:
        return { label: sub.status, variant: "neutral" as const, reason: null };
    }
  }

  const hasActive = subs.some((s) => s.status === "active" && s.sessions_remaining > 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Subscriptions</h1>
          <p className="text-slate-500 text-sm">Manage your training packages</p>
        </div>
        <Link
          href="/player/subscribe"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {hasActive ? "Renew" : "Subscribe"}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {subs.length === 0 ? (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title="No Subscriptions Yet"
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
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden sm:block overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                      Package
                    </th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                      Sessions
                    </th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                      Price
                    </th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                      Start Date
                    </th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                      End Date
                    </th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                      Message
                    </th>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((sub, i) => {
                    const display = getDisplayStatus(sub);
                    return (
                      <tr key={sub.id} className="border-b border-slate-100">
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{sub.packages?.name || "—"}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {sub.sessions_total === 1
                            ? sub.sessions_total
                            : `${sub.sessions_remaining} / ${sub.sessions_total}`}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {formatPaidPrice(sub)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {sub.start_date ? formatDate(sub.start_date) : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {sub.end_date ? formatDate(sub.end_date) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={display.variant}>{display.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {display.reason ? (
                            <span className="text-red-500">{display.reason}</span>
                          ) : display.label === "Pending Confirmation" ? (
                            <span className="text-amber-500">Awaiting confirmation</span>
                          ) : display.label === "Pending Payment" ? (
                            <span className="text-amber-500">Payment required</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3">
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {subs.map((sub) => {
              const display = getDisplayStatus(sub);
              const message = display.reason
                ? { text: display.reason, className: "bg-red-50 text-red-700" }
                : display.label === "Pending Payment"
                ? { text: "Payment required", className: "bg-amber-50 text-amber-700" }
                : display.label === "Pending Confirmation"
                ? { text: "Awaiting confirmation", className: "bg-amber-50 text-amber-700" }
                : null;
              return (
                <Card key={sub.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900 min-w-0">{sub.packages?.name || "—"}</p>
                    <Badge variant={display.variant}>{display.label}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                    <div>
                      <dt className="text-slate-400">Sessions</dt>
                      <dd className="text-sm text-slate-800 font-medium">
                        {sub.sessions_total === 1
                          ? sub.sessions_total
                          : `${sub.sessions_remaining} / ${sub.sessions_total}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Price</dt>
                      <dd className="text-sm text-slate-800 font-medium">{formatPaidPrice(sub)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">{sub.start_date ? "Start date" : "Requested"}</dt>
                      <dd className="text-sm text-slate-800 font-medium">
                        {formatDate(sub.start_date ?? sub.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">End date</dt>
                      <dd className="text-sm text-slate-800 font-medium">
                        {sub.end_date ? formatDate(sub.end_date) : "—"}
                      </dd>
                    </div>
                  </dl>
                  {message && (
                    <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${message.className}`}>{message.text}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
