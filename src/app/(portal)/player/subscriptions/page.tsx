import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { Package, ArrowRight } from "lucide-react";
import type { Subscription } from "@/types/database";

interface SubWithPackage extends Subscription {
  packages: { name: string; session_count: number; price: number } | null;
  payments: { status: string; rejection_reason: string | null }[] | null;
}

export default async function PlayerSubscriptionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: subscriptions } = (await supabase
    .from("subscriptions")
    .select("*, packages(name, session_count, price), payments(status, rejection_reason)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false })) as { data: SubWithPackage[] | null };

  const subs = subscriptions ?? [];

  function getDisplayStatus(sub: SubWithPackage) {
    const rejectedPayment = sub.payments?.find((p) => p.status === "rejected");
    if (sub.status === "cancelled" && rejectedPayment) {
      return { label: "Rejected", variant: "danger" as const, reason: rejectedPayment.rejection_reason };
    }
    switch (sub.status) {
      case "active":
        return { label: "Active", variant: "success" as const, reason: null };
      case "pending":
        return { label: "Pending", variant: "warning" as const, reason: null };
      case "expired":
        return { label: "Expired", variant: "neutral" as const, reason: null };
      case "cancelled":
        return { label: "Cancelled", variant: "danger" as const, reason: null };
      default:
        return { label: sub.status, variant: "neutral" as const, reason: null };
    }
  }

  const hasActive = subs.some((s) => s.status === "active");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Subscriptions</h1>
          <p className="text-slate-500 text-sm">Manage your training packages</p>
        </div>
        <Link
          href="/player/subscribe"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
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
              className="text-sm font-medium text-primary hover:underline"
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
                  </tr>
                </thead>
                <tbody>
                  {subs.map((sub, i) => {
                    const display = getDisplayStatus(sub);
                    return (
                      <tr
                        key={sub.id}
                        className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-[#FAFBFC]" : ""}`}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                          {sub.packages?.name || "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {sub.sessions_remaining} / {sub.sessions_total}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {sub.packages?.price ? `${sub.packages.price.toLocaleString("en-US")} EGP` : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {sub.start_date ? new Date(sub.start_date).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {sub.end_date ? new Date(sub.end_date).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={display.variant}>{display.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {display.reason ? (
                            <span className="text-red-500">{display.reason}</span>
                          ) : display.label === "Pending" ? (
                            <span className="text-amber-500">Awaiting confirmation</span>
                          ) : (
                            "—"
                          )}
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
              return (
                <Card key={sub.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {sub.packages?.name || "—"}
                    </p>
                    <Badge variant={display.variant}>{display.label}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Sessions</span>
                      <p className="text-slate-700 font-medium">
                        {sub.sessions_remaining}/{sub.sessions_total}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Price</span>
                      <p className="text-slate-700 font-medium">
                        {sub.packages?.price ? `${sub.packages.price.toLocaleString("en-US")} EGP` : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Date</span>
                      <p className="text-slate-700 font-medium">
                        {sub.start_date
                          ? new Date(sub.start_date).toLocaleDateString()
                          : new Date(sub.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {(display.reason || display.label === "Pending") && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-400">Message: </span>
                      {display.reason ? (
                        <span className="text-red-500">{display.reason}</span>
                      ) : (
                        <span className="text-amber-500">Awaiting confirmation</span>
                      )}
                    </div>
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
