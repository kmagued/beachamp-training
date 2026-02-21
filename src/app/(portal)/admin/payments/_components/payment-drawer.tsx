"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Badge, Button, Input, Select } from "@/components/ui";
import { X, Check, Image as ImageIcon, Loader2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { updatePayment } from "../actions";
import type { PaymentRow } from "./types";

function StatusBadge({ status }: { status: string }) {
  const variant = status === "pending" ? "warning" : status === "confirmed" ? "success" : status === "rejected" ? "danger" : "neutral";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-slate-700 text-right">{value}</span>
    </div>
  );
}

interface PaymentDrawerProps {
  payment: PaymentRow | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onViewScreenshot: (path: string) => void;
  onDataChange: () => void;
  isPending: boolean;
  actionId: string | null;
}

export function PaymentDrawer({
  payment,
  onClose,
  onConfirm,
  onReject,
  onViewScreenshot,
  onDataChange,
  isPending,
  actionId,
}: PaymentDrawerProps) {
  const open = !!payment;

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, handleEsc]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Desktop: right side panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl border-l border-slate-200 transition-transform duration-300 ease-out hidden sm:flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {payment && <DrawerContent payment={payment} onClose={onClose} onConfirm={onConfirm} onReject={onReject} onViewScreenshot={onViewScreenshot} onDataChange={onDataChange} isPending={isPending} actionId={actionId} />}
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-white shadow-xl border-t border-slate-200 rounded-t-2xl transition-transform duration-300 ease-out sm:hidden max-h-[85vh] flex flex-col",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>
        {payment && <DrawerContent payment={payment} onClose={onClose} onConfirm={onConfirm} onReject={onReject} onViewScreenshot={onViewScreenshot} onDataChange={onDataChange} isPending={isPending} actionId={actionId} />}
      </div>
    </>
  );
}

function DrawerContent({
  payment,
  onClose,
  onConfirm,
  onReject,
  onViewScreenshot,
  onDataChange,
  isPending,
  actionId,
}: {
  payment: PaymentRow;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onViewScreenshot: (path: string) => void;
  onDataChange: () => void;
  isPending: boolean;
  actionId: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(payment.amount);
  const [editMethod, setEditMethod] = useState(payment.method);
  const [editStatus, setEditStatus] = useState(payment.status);
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();

  // Reset edit state when payment changes
  useEffect(() => {
    setEditing(false);
    setEditAmount(payment.amount);
    setEditMethod(payment.method);
    setEditStatus(payment.status);
    setEditError(null);
  }, [payment.id, payment.amount, payment.method, payment.status]);

  function handleSaveEdit() {
    if (editAmount <= 0) {
      setEditError("Amount must be greater than 0");
      return;
    }
    setEditError(null);
    startUpdateTransition(async () => {
      const res = await updatePayment(payment.id, {
        amount: editAmount,
        method: editMethod,
        status: editStatus !== payment.status ? editStatus : undefined,
      });
      if ("error" in res) {
        setEditError(res.error ?? "Failed to update payment");
      } else {
        setEditing(false);
        onDataChange();
      }
    });
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div>
          <h2 className="font-semibold text-slate-900">Payment Details</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {payment.profiles?.first_name} {payment.profiles?.last_name}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Amount (EGP)</label>
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(Number(e.target.value))}
                min={1}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Method</label>
              <Select value={editMethod} onChange={(e) => setEditMethod(e.target.value)}>
                <option value="instapay">Instapay</option>
                <option value="cash">Cash</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
              <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
            {editError && (
              <p className="text-xs text-red-600">{editError}</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl font-bold text-slate-900">{payment.amount.toLocaleString()} EGP</span>
              <StatusBadge status={payment.status} />
            </div>

            <div className="space-y-0">
              <DetailRow label="Player" value={`${payment.profiles?.first_name ?? ""} ${payment.profiles?.last_name ?? ""}`} />
              <DetailRow label="Package" value={payment.subscriptions?.packages?.name || "—"} />
              <DetailRow
                label="Method"
                value={<span className="capitalize">{payment.method.replace(/_/g, " ")}</span>}
              />
              <DetailRow
                label="Submitted"
                value={new Date(payment.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
              {payment.confirmed_at && (
                <DetailRow
                  label="Confirmed"
                  value={new Date(payment.confirmed_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                />
              )}
              {payment.status === "rejected" && payment.rejection_reason && (
                <DetailRow
                  label="Rejection Reason"
                  value={<span className="text-red-500">{payment.rejection_reason}</span>}
                />
              )}
            </div>

            {payment.screenshot_url && (
              <button
                onClick={() => onViewScreenshot(payment.screenshot_url!)}
                className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ImageIcon className="w-4 h-4" />
                View Payment Screenshot
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-5 py-4 border-t border-slate-100 space-y-3">
        {editing ? (
          <div className="flex gap-3">
            <Button onClick={handleSaveEdit} disabled={isUpdating} fullWidth>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="secondary" onClick={() => { setEditing(false); setEditAmount(payment.amount); setEditMethod(payment.method); setEditStatus(payment.status); setEditError(null); }} disabled={isUpdating}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            {payment.status === "pending" && (
              <div className="flex gap-3">
                <button
                  onClick={() => onConfirm(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  {isPending && actionId === payment.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Confirm Payment
                </button>
                <button
                  onClick={() => onReject(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
              </div>
            )}
            <button
              onClick={() => setEditing(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Payment
            </button>
          </>
        )}
      </div>
    </>
  );
}
