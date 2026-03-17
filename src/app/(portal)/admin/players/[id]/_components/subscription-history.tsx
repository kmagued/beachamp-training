"use client";

import { useState, useTransition } from "react";
import { Card, Badge, EmptyState, Button } from "@/components/ui";
import { Package, Pencil, Check, X, Loader2, Snowflake, Play, Plus } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { updateSubscriptionBalance, freezeSubscription, unfreezeSubscription } from "../actions";
import { useRouter } from "next/navigation";
import { NewPaymentDrawer } from "../../../payments/_components/new-payment-drawer";
import type { SubscriptionRow, PaymentRow } from "./types";

function getEffectiveStatus(sub: SubscriptionRow): string {
  if (sub.status === "active" || sub.status === "pending") {
    if (sub.sessions_remaining <= 0) return "expired";
    if (sub.end_date && new Date(sub.end_date).getTime() < Date.now()) return "expired";
  }
  return sub.status;
}

function SubStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active": return <Badge variant="success">Active</Badge>;
    case "pending": return <Badge variant="warning">Pending Confirmation</Badge>;
    case "pending_payment": return <Badge variant="warning">Pending Payment</Badge>;
    case "expired": return <Badge variant="danger">Expired</Badge>;
    case "cancelled": return <Badge variant="neutral">Cancelled</Badge>;
    case "frozen": return <Badge variant="info">Frozen</Badge>;
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
  playerId: string;
  playerName: string;
}

export function SubscriptionHistory({ subscriptions, paymentsBySub, playerId, playerName }: SubscriptionHistoryProps) {
  const router = useRouter();
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editRemaining, setEditRemaining] = useState(0);
  const [editTotal, setEditTotal] = useState(0);
  const [isSaving, startSaveTransition] = useTransition();
  const [isFreezing, startFreezeTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);

  function startEdit(sub: SubscriptionRow) {
    setEditingSubId(sub.id);
    setEditRemaining(sub.sessions_remaining);
    setEditTotal(sub.sessions_total);
    setError(null);
  }

  function cancelEdit() {
    setEditingSubId(null);
    setError(null);
  }

  function saveEdit(subId: string) {
    startSaveTransition(async () => {
      setError(null);
      const res = await updateSubscriptionBalance(subId, editRemaining, editTotal);
      if ("error" in res) {
        setError(res.error ?? "Failed to update");
      } else {
        setEditingSubId(null);
        router.refresh();
      }
    });
  }

  function handleFreeze(subId: string) {
    startFreezeTransition(async () => {
      setError(null);
      const res = await freezeSubscription(subId);
      if ("error" in res) setError(res.error ?? "Failed to freeze");
      else router.refresh();
    });
  }

  function handleUnfreeze(subId: string) {
    startFreezeTransition(async () => {
      setError(null);
      const res = await unfreezeSubscription(subId);
      if ("error" in res) setError(res.error ?? "Failed to unfreeze");
      else router.refresh();
    });
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          Subscription History
        </h2>
        <Button size="sm" onClick={() => setShowAddPayment(true)}>
          <span className="flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Payment
          </span>
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
          <X className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

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
                  <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const subPayments = paymentsBySub[sub.id] || [];
                  const confirmedPayment = subPayments.find((p) => p.status === "confirmed");
                  const latestPayment = subPayments[0];
                  const displayPayment = confirmedPayment || latestPayment;
                  const isEditing = editingSubId === sub.id;
                  const effectiveStatus = getEffectiveStatus(sub);

                  return (
                    <tr key={sub.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 font-medium text-slate-900">{sub.packages?.name || "—"}</td>
                      <td className="py-3 text-slate-700">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={editRemaining}
                              onChange={(e) => setEditRemaining(Math.max(0, Number(e.target.value)))}
                              className="w-12 px-1.5 py-0.5 text-sm border border-slate-300 rounded text-center"
                            />
                            <span className="text-slate-400">/</span>
                            <input
                              type="number"
                              min={1}
                              value={editTotal}
                              onChange={(e) => setEditTotal(Math.max(1, Number(e.target.value)))}
                              className="w-12 px-1.5 py-0.5 text-sm border border-slate-300 rounded text-center"
                            />
                            <button
                              onClick={() => saveEdit(sub.id)}
                              disabled={isSaving}
                              className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50"
                            >
                              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{sub.sessions_total === 1 ? sub.sessions_remaining : `${sub.sessions_remaining}/${sub.sessions_total}`}</span>
                            <button
                              onClick={() => startEdit(sub)}
                              className="p-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                              title="Edit sessions"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-slate-500 whitespace-nowrap">{sub.start_date ? formatDate(sub.start_date) : "—"}</td>
                      <td className="py-3 text-slate-500 whitespace-nowrap">{sub.end_date ? formatDate(sub.end_date) : "—"}</td>
                      <td className="py-3"><SubStatusBadge status={effectiveStatus} /></td>
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
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(effectiveStatus === "active" || effectiveStatus === "pending") && sub.sessions_total > 1 && (
                            <button
                              onClick={() => handleFreeze(sub.id)}
                              disabled={isFreezing}
                              className="p-1 rounded text-blue-500 hover:bg-blue-50 transition-colors"
                              title="Freeze"
                            >
                              {isFreezing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Snowflake className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {effectiveStatus === "frozen" && (
                            <button
                              onClick={() => handleUnfreeze(sub.id)}
                              disabled={isFreezing}
                              className="p-1 rounded text-emerald-500 hover:bg-emerald-50 transition-colors"
                              title="Unfreeze"
                            >
                              {isFreezing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
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
              const isEditing = editingSubId === sub.id;
              const effectiveStatus = getEffectiveStatus(sub);

              return (
                <div key={sub.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-900 text-sm">{sub.packages?.name || "—"}</span>
                    <div className="flex items-center gap-1.5">
                      <SubStatusBadge status={effectiveStatus} />
                      {(effectiveStatus === "active" || effectiveStatus === "pending") && sub.sessions_total > 1 && (
                        <button
                          onClick={() => handleFreeze(sub.id)}
                          disabled={isFreezing}
                          className="p-1 rounded text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Freeze"
                        >
                          <Snowflake className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {effectiveStatus === "frozen" && (
                        <button
                          onClick={() => handleUnfreeze(sub.id)}
                          disabled={isFreezing}
                          className="p-1 rounded text-emerald-500 hover:bg-emerald-50 transition-colors"
                          title="Unfreeze"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Sessions</span>
                      {isEditing ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="number"
                            min={0}
                            value={editRemaining}
                            onChange={(e) => setEditRemaining(Math.max(0, Number(e.target.value)))}
                            className="w-10 px-1 py-0.5 text-xs border border-slate-300 rounded text-center"
                          />
                          <span className="text-slate-400">/</span>
                          <input
                            type="number"
                            min={1}
                            value={editTotal}
                            onChange={(e) => setEditTotal(Math.max(1, Number(e.target.value)))}
                            className="w-10 px-1 py-0.5 text-xs border border-slate-300 rounded text-center"
                          />
                          <button
                            onClick={() => saveEdit(sub.id)}
                            disabled={isSaving}
                            className="p-0.5 rounded text-emerald-600 hover:bg-emerald-50"
                          >
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-0.5 rounded text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <p className="text-slate-700 font-medium">
                            {sub.sessions_total === 1 ? sub.sessions_remaining : `${sub.sessions_remaining}/${sub.sessions_total}`}
                          </p>
                          <button
                            onClick={() => startEdit(sub)}
                            className="p-0.5 rounded text-slate-400 hover:text-slate-600"
                            title="Edit"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400">Period</span>
                      <p className="text-slate-700 font-medium">
                        {sub.start_date ? formatDate(sub.start_date) : "—"} — {sub.end_date ? formatDate(sub.end_date) : "—"}
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

      <NewPaymentDrawer
        open={showAddPayment}
        onClose={() => setShowAddPayment(false)}
        onSuccess={() => { setShowAddPayment(false); router.refresh(); }}
        prefillPlayerId={playerId}
        prefillPlayerName={playerName}
      />
    </Card>
  );
}
