"use client";

import { useState, useTransition, useMemo } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button, Drawer, Textarea, DatePicker, Toast } from "@/components/ui";
import {
  confirmPrivateSessionRequest,
  rejectPrivateSessionRequest,
} from "@/app/_actions/private-sessions";

interface Props {
  requestId: string;
  requestedDayOfWeek: number;
  requestedTime: string;
}

/** Next date (YYYY-MM-DD) on or after today that matches the given day_of_week (0=Sun..6=Sat) */
function nextDateForDayOfWeek(dayOfWeek: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - today.getDay() + 7) % 7;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

export function ActionButtons({ requestId, requestedDayOfWeek, requestedTime }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [sessionDate, setSessionDate] = useState(() => nextDateForDayOfWeek(requestedDayOfWeek));
  const [location, setLocation] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const dayMatches = useMemo(() => {
    if (!sessionDate) return false;
    return new Date(sessionDate + "T00:00:00").getDay() === requestedDayOfWeek;
  }, [sessionDate, requestedDayOfWeek]);

  function handleConfirm() {
    if (!dayMatches) {
      setToast({ message: "Date must match the requested day of week.", variant: "error" });
      return;
    }
    startTransition(async () => {
      const res = await confirmPrivateSessionRequest(requestId, sessionDate, {
        location: location || undefined,
      });
      if ("error" in res) {
        setToast({ message: res.error ?? "Failed", variant: "error" });
      } else {
        setShowConfirm(false);
        setToast({ message: "Session created", variant: "success" });
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const res = await rejectPrivateSessionRequest(requestId, rejectReason || undefined);
      if ("error" in res) setToast({ message: res.error ?? "Failed", variant: "error" });
      else setShowReject(false);
    });
  }

  return (
    <>
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowConfirm(true)}
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
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Private Session"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowConfirm(false)} disabled={isPending} fullWidth>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isPending || !dayMatches} fullWidth>
              {isPending ? "Creating..." : "Create Session"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Pick the specific date to schedule this session. The session will appear on the schedule and daily report.
          </p>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Session date</label>
            <DatePicker value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            <p className="mt-1 text-[11px] text-slate-400">
              Requested time: {requestedTime.slice(0, 5)}
            </p>
            {sessionDate && !dayMatches && (
              <p className="mt-1 text-[11px] text-red-500">
                Selected date&apos;s weekday doesn&apos;t match the request.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Location (optional)</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Court 1"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>
      </Drawer>

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
