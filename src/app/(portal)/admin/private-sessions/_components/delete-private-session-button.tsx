"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { ConfirmDialog, Toast } from "@/components/ui";
import { deletePrivateScheduleSession } from "@/app/_actions/private-sessions";

interface Props {
  scheduleSessionId: string;
  playerName: string;
  dateLabel: string;
}

export function DeletePrivateSessionButton({ scheduleSessionId, playerName, dateLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  function handleConfirm() {
    startTransition(async () => {
      const res = await deletePrivateScheduleSession(scheduleSessionId);
      if ("error" in res) {
        setToast({ message: res.error ?? "Failed to delete", variant: "error" });
      } else {
        setOpen(false);
        setToast({ message: "Session deleted", variant: "success" });
      }
    });
  }

  return (
    <>
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
        title="Delete session"
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Delete private session?"
        description={
          <span>
            This will remove the session for <b>{playerName}</b> on <b>{dateLabel}</b> from the schedule and daily report.
          </span>
        }
        confirmLabel="Delete"
        loading={isPending}
      />
    </>
  );
}
