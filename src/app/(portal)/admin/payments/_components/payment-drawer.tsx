"use client";

import { useEffect, useCallback } from "react";
import { Badge } from "@/components/ui";
import { X, Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
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
  isPending: boolean;
  actionId: string | null;
}

export function PaymentDrawer({
  payment,
  onClose,
  onConfirm,
  onReject,
  onViewScreenshot,
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
        {payment && <DrawerContent payment={payment} onClose={onClose} onConfirm={onConfirm} onReject={onReject} onViewScreenshot={onViewScreenshot} isPending={isPending} actionId={actionId} />}
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
        {payment && <DrawerContent payment={payment} onClose={onClose} onConfirm={onConfirm} onReject={onReject} onViewScreenshot={onViewScreenshot} isPending={isPending} actionId={actionId} />}
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
  isPending,
  actionId,
}: {
  payment: PaymentRow;
  onClose: () => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onViewScreenshot: (path: string) => void;
  isPending: boolean;
  actionId: string | null;
}) {
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
      </div>

      {/* Footer actions for pending */}
      {payment.status === "pending" && (
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
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
    </>
  );
}
