import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { CreditCard, Package, ArrowRight } from "lucide-react";
import type { Subscription } from "@/types/database";

interface SubWithPackage extends Subscription {
  packages: { name: string; session_count: number; price: number } | null;
}

export default async function PlayerSubscriptionsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: subscriptions } = (await supabase
    .from("subscriptions")
    .select("*, packages(name, session_count, price)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false })) as { data: SubWithPackage[] | null };

  const active = subscriptions?.find((s) => s.status === "active") ?? null;
  const pending = subscriptions?.find((s) => s.status === "pending") ?? null;
  const history = subscriptions?.filter((s) => s.status !== "active" && s.status !== "pending") ?? [];

  const statusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success" as const;
      case "pending":
        return "warning" as const;
      case "expired":
        return "neutral" as const;
      case "cancelled":
        return "danger" as const;
      default:
        return "neutral" as const;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Subscriptions</h1>
          <p className="text-slate-500 text-sm">Manage your training packages</p>
        </div>
        <Link
          href="/player/renew"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {active ? "Renew" : "Subscribe"}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Active Subscription */}
      {active && (
        <Card className="mb-6 border-l-4 border-l-emerald-500">
          <div className="flex items-start justify-between mb-3">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              Active Subscription
            </h2>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-slate-400">Package</p>
              <p className="text-sm font-medium text-slate-900">{active.packages?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Sessions</p>
              <p className="text-sm font-medium text-slate-900">
                {active.sessions_remaining} / {active.sessions_total}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Started</p>
              <p className="text-sm font-medium text-slate-900">
                {active.start_date ? new Date(active.start_date).toLocaleDateString() : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Expires</p>
              <p className="text-sm font-medium text-slate-900">
                {active.end_date ? new Date(active.end_date).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Pending Subscription */}
      {pending && (
        <Card className="mb-6 border-l-4 border-l-amber-400">
          <div className="flex items-start justify-between mb-3">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              Pending Confirmation
            </h2>
            <Badge variant="warning">Pending</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Your payment for <span className="font-medium text-slate-700">{pending.packages?.name}</span> is
            being reviewed by the admin.
          </p>
        </Card>
      )}

      {/* No subscription at all */}
      {!active && !pending && history.length === 0 && (
        <EmptyState
          icon={<Package className="w-12 h-12" />}
          title="No Subscriptions Yet"
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

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="font-semibold text-slate-900 mb-3">History</h2>
          <div className="space-y-3">
            {history.map((sub) => (
              <Card key={sub.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-slate-900">{sub.packages?.name || "—"}</p>
                      <Badge variant={statusVariant(sub.status)}>{sub.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      {sub.start_date
                        ? new Date(sub.start_date).toLocaleDateString()
                        : new Date(sub.created_at).toLocaleDateString()}
                      {sub.end_date && ` — ${new Date(sub.end_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-700">
                      {sub.sessions_remaining}/{sub.sessions_total} sessions
                    </p>
                    {sub.packages?.price && (
                      <p className="text-xs text-slate-400">{sub.packages.price.toLocaleString()} EGP</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
