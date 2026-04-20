import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card, Button, Input, Drawer } from "@/components/ui";
import { X, Loader2, Trash2 } from "lucide-react";
import type { PaymentRow } from "./types";

function usePortalReady() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

interface RejectModalProps {
  rejectingId: string | null;
  rejectReason: string;
  onReasonChange: (value: string) => void;
  onReject: () => void;
  onCancel: () => void;
  isPending: boolean;
  actionId: string | null;
}

export function RejectModal({
  rejectingId,
  rejectReason,
  onReasonChange,
  onReject,
  onCancel,
  isPending,
  actionId,
}: RejectModalProps) {
  const mounted = usePortalReady();
  if (!rejectingId || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h3 className="font-semibold text-slate-900 mb-3">Reject Payment</h3>
        <p className="text-sm text-slate-500 mb-4">
          Please provide a reason for rejecting this payment.
        </p>
        <Input
          value={rejectReason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Rejection reason..."
          className="mb-4"
        />
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onReject}
            disabled={!rejectReason.trim() || isPending}
            fullWidth
            className="!bg-red-600 hover:!bg-red-700"
          >
            {isPending && actionId === rejectingId ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Rejecting...
              </span>
            ) : (
              "Reject"
            )}
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel} fullWidth>
            Cancel
          </Button>
        </div>
      </Card>
    </div>,
    document.body
  );
}

interface ScreenshotLightboxProps {
  url: string | null;
  onClose: () => void;
}

interface ConfirmDeleteDrawerProps {
  open: boolean;
  payments: PaymentRow[];
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function ConfirmDeleteDrawer({
  open,
  payments,
  onConfirm,
  onCancel,
  isPending,
}: ConfirmDeleteDrawerProps) {
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  return (
    <Drawer
      open={open}
      onClose={onCancel}
      title={`Delete ${payments.length} Payment${payments.length > 1 ? "s" : ""}`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isPending} fullWidth>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            fullWidth
            className="!bg-red-600 hover:!bg-red-700"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Delete All
              </span>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          This action cannot be undone. The following payments will be permanently deleted:
        </p>
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between bg-red-50 rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name}` : "Quick Payment"}
                </p>
                <p className="text-xs text-slate-400">
                  {p.subscriptions?.packages?.name || "—"} · {p.status}
                </p>
              </div>
              <span className="text-sm font-semibold text-slate-700 shrink-0 ml-3">{p.amount} EGP</span>
            </div>
          ))}
        </div>
        {payments.length > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500">Total</span>
            <span className="text-sm font-semibold text-slate-900">{total.toLocaleString()} EGP</span>
          </div>
        )}
      </div>
    </Drawer>
  );
}

export function ScreenshotLightbox({ url, onClose }: ScreenshotLightboxProps) {
  const mounted = usePortalReady();
  if (!url || !mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="max-w-2xl max-h-[80vh] relative">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-slate-300"
        >
          <X className="w-6 h-6" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Payment screenshot"
          className="max-w-full max-h-[80vh] rounded-lg object-contain"
        />
      </div>
    </div>,
    document.body
  );
}
