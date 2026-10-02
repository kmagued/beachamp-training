"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { ConfirmDrawer } from "@/components/ui";
import { cancelPrivateSessionRequest } from "@/app/_actions/private-sessions";

export function CancelButton({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelPrivateSessionRequest(requestId);
      if ("error" in res && res.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <>
      {/* A tap only asks; nothing is cancelled until it's confirmed */}
      <button
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 -my-1 py-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
      >
        <X className="w-3 h-3" />
        Cancel request
      </button>
      <ConfirmDrawer
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleCancel}
        title="Cancel this request?"
        description="Your request will be withdrawn. You can send a new one at any time."
        details={error && <p className="text-sm text-red-600">{error}</p>}
        confirmLabel="Cancel request"
        cancelLabel="Keep it"
        loadingLabel="Cancelling..."
        loading={isPending}
      />
    </>
  );
}
