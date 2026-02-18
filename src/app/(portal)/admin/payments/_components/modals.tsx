import { Card, Button, Input } from "@/components/ui";
import { X, Loader2 } from "lucide-react";

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
  if (!rejectingId) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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
    </div>
  );
}

interface ScreenshotLightboxProps {
  url: string | null;
  onClose: () => void;
}

export function ScreenshotLightbox({ url, onClose }: ScreenshotLightboxProps) {
  if (!url) return null;
  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
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
    </div>
  );
}
