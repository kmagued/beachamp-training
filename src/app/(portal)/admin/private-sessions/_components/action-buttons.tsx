"use client";

import { useState, useTransition } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button, Drawer, Textarea } from "@/components/ui";
import { updatePrivateSessionStatus } from "@/app/_actions/private-sessions";

export function ActionButtons({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function handleConfirm() {
    startTransition(async () => {
      await updatePrivateSessionStatus(requestId, "confirmed");
    });
  }

  function handleReject() {
    startTransition(async () => {
      await updatePrivateSessionStatus(requestId, "rejected", rejectReason || undefined);
      setShowReject(false);
    });
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={handleConfirm}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
        >
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Confirm
        </button>
        <span className="text-slate-200">|</span>
        <button
          onClick={() => setShowReject(true)}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>

      <Drawer
        open={showReject}
        onClose={() => setShowReject(false)}
        title="Reject Request"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowReject(false)} disabled={isPending} fullWidth>
              Cancel
            </Button>
            <Button onClick={handleReject} disabled={isPending} fullWidth>
              {isPending ? "Rejecting..." : "Reject"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Optionally provide a reason for rejection:
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            rows={3}
          />
        </div>
      </Drawer>
    </>
  );
}
