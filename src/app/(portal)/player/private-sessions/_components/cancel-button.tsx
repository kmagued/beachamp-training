"use client";

import { useTransition } from "react";
import { X, Loader2 } from "lucide-react";
import { cancelPrivateSessionRequest } from "@/app/_actions/private-sessions";

export function CancelButton({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    startTransition(async () => {
      await cancelPrivateSessionRequest(requestId);
    });
  }

  return (
    <button
      onClick={handleCancel}
      disabled={isPending}
      className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
    >
      {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
      Cancel
    </button>
  );
}
