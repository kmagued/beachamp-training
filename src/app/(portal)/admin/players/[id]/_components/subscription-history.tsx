import { Card, Badge, EmptyState } from "@/components/ui";
import { Package } from "lucide-react";
import type { SubscriptionRow, PaymentRow } from "./types";

function SubStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active": return <Badge variant="success">Active</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    case "expired": return <Badge variant="danger">Expired</Badge>;
    case "cancelled": return <Badge variant="neutral">Cancelled</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "confirmed": return <Badge variant="success">Confirmed</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    case "rejected": return <Badge variant="danger">Rejected</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

interface SubscriptionHistoryProps {
  subscriptions: SubscriptionRow[];
  paymentsBySub: Record<string, PaymentRow[]>;
}

export function SubscriptionHistory({ subscriptions, paymentsBySub }: SubscriptionHistoryProps) {
  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
        <Package className="w-4 h-4 text-slate-400" />
        Subscription History
      </h2>

      {subscriptions.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Package</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Sessions</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Start</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">End</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Status</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Payment</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const subPayments = paymentsBySub[sub.id] || [];
                  const confirmedPayment = subPayments.find((p) => p.status === "confirmed");
                  const latestPayment = subPayments[0];
                  const displayPayment = confirmedPayment || latestPayment;

                  return (
                    <tr key={sub.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 font-medium text-slate-900">{sub.packages?.name || "—"}</td>
                      <td className="py-3 text-slate-700">{sub.sessions_remaining}/{sub.sessions_total}</td>
                      <td className="py-3 text-slate-500">{sub.start_date ? new Date(sub.start_date).toLocaleDateString() : "—"}</td>
                      <td className="py-3 text-slate-500">{sub.end_date ? new Date(sub.end_date).toLocaleDateString() : "—"}</td>
                      <td className="py-3"><SubStatusBadge status={sub.status} /></td>
                      <td className="py-3">
                        {displayPayment ? (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-700">{displayPayment.amount.toLocaleString()} EGP</span>
                            <span className="text-slate-400 capitalize text-xs">{displayPayment.method.replace(/_/g, " ")}</span>
                            <PaymentStatusBadge status={displayPayment.status} />
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {subscriptions.map((sub) => {
              const subPayments = paymentsBySub[sub.id] || [];
              const confirmedPayment = subPayments.find((p) => p.status === "confirmed");
              const latestPayment = subPayments[0];
              const displayPayment = confirmedPayment || latestPayment;

              return (
                <div key={sub.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-900 text-sm">{sub.packages?.name || "—"}</span>
                    <SubStatusBadge status={sub.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Sessions</span>
                      <p className="text-slate-700 font-medium">{sub.sessions_remaining}/{sub.sessions_total}</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Period</span>
                      <p className="text-slate-700 font-medium">
                        {sub.start_date ? new Date(sub.start_date).toLocaleDateString() : "—"} — {sub.end_date ? new Date(sub.end_date).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    {displayPayment && (
                      <div className="col-span-2">
                        <span className="text-slate-400">Payment</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-slate-700 font-medium">{displayPayment.amount.toLocaleString()} EGP</span>
                          <span className="text-slate-400 capitalize">{displayPayment.method.replace(/_/g, " ")}</span>
                          <PaymentStatusBadge status={displayPayment.status} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Package className="w-8 h-8" />}
          title="No Subscriptions"
          description="This player has no subscription history yet."
        />
      )}
    </Card>
  );
}
