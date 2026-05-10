"use client";

import { useState, useTransition, useEffect } from "react";
import { Drawer, Button, Input, Select, DatePicker, Textarea } from "@/components/ui";
import { createCoachBlock } from "@/app/_actions/coach-blocks";
import type { Conflict } from "@/lib/scheduling/coach-availability";

interface CoachOption { id: string; first_name: string; last_name: string }

interface BlockTimeDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultCoachId: string;
  isAdmin: boolean;
  coachOptions?: CoachOption[];
  onSuccess: (result: { conflictCount: number; conflicts: Conflict[] }) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BlockTimeDrawer({
  open,
  onClose,
  defaultCoachId,
  isAdmin,
  coachOptions,
  onSuccess,
}: BlockTimeDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [coachId, setCoachId] = useState(defaultCoachId);
  const [kind, setKind] = useState<'one_time' | 'weekly'>('one_time');

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(false);

  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setError(null);
      setCoachId(defaultCoachId);
      setKind('one_time');
      setStartDate("");
      setEndDate("");
      setAllDay(false);
      setSelectedDays([]);
      setEffectiveFrom("");
      setEffectiveUntil("");
      setStartTime("");
      setEndTime("");
      setReason("");
    }
  }, [open, defaultCoachId]);

  function toggleDay(d: number) {
    setSelectedDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  function handleSubmit() {
    setError(null);

    if (isAdmin && !coachId) { setError("Pick a coach"); return; }

    if (kind === 'one_time') {
      if (!startDate) { setError("Pick a start date"); return; }
      if (endDate && endDate < startDate) { setError("End date must be on or after start date"); return; }
      if (!allDay) {
        if (!startTime || !endTime) { setError("Pick start and end times, or check All Day"); return; }
        if (startTime >= endTime) { setError("End time must be after start time"); return; }
      }
    } else {
      if (selectedDays.length === 0) { setError("Pick at least one day"); return; }
      if (!startTime || !endTime) { setError("Pick start and end times"); return; }
      if (startTime >= endTime) { setError("End time must be after start time"); return; }
      if (effectiveFrom && effectiveUntil && effectiveUntil < effectiveFrom) {
        setError("Active until must be on or after active from"); return;
      }
    }

    startTransition(async () => {
      const allConflicts: Conflict[] = [];

      if (kind === 'one_time') {
        const res = await createCoachBlock({
          coach_id: coachId,
          kind: 'one_time',
          start_date: startDate,
          end_date: endDate || startDate,
          start_time: allDay ? null : startTime,
          end_time: allDay ? null : endTime,
          reason: reason.trim() || null,
        });
        if ('error' in res) { setError(res.error); return; }
        allConflicts.push(...res.conflicts);
      } else {
        for (const day of selectedDays) {
          const res = await createCoachBlock({
            coach_id: coachId,
            kind: 'weekly',
            day_of_week: day,
            effective_from: effectiveFrom || null,
            effective_until: effectiveUntil || null,
            start_time: startTime,
            end_time: endTime,
            reason: reason.trim() || null,
          });
          if ('error' in res) { setError(res.error); return; }
          allConflicts.push(...res.conflicts);
        }
      }

      onSuccess({ conflictCount: allConflicts.length, conflicts: allConflicts });
      onClose();
    });
  }

  return (
    <Drawer open={open} onClose={onClose} title="Block Time">
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        {isAdmin && coachOptions && (
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Coach</label>
            <Select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              <option value="">Select coach...</option>
              {coachOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('one_time')}
              className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border ${
                kind === 'one_time' ? 'bg-primary-50 border-primary text-primary' : 'border-slate-200 text-slate-500'
              }`}
            >
              One-time
            </button>
            <button
              type="button"
              onClick={() => setKind('weekly')}
              className={`flex-1 text-sm font-medium px-3 py-2 rounded-lg border ${
                kind === 'weekly' ? 'bg-primary-50 border-primary text-primary' : 'border-slate-200 text-slate-500'
              }`}
            >
              Recurring weekly
            </button>
          </div>
        </div>

        {kind === 'one_time' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">From</label>
                <DatePicker value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder="Start date" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">To</label>
                <DatePicker value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="End date (optional)" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>All day</span>
            </label>

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Start time</label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">End time</label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Days</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, idx) => {
                  const selected = selectedDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                        selected ? 'bg-primary-50 border-primary text-primary' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Start time</label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">End time</label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Active from (optional)</label>
                <DatePicker value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} placeholder="Forever" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Active until (optional)</label>
                <DatePicker value={effectiveUntil} onChange={(e) => setEffectiveUntil(e.target.value)} placeholder="Forever" />
              </div>
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Reason (optional)</label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Vacation, Day job" rows={2} />
        </div>

        <Button type="button" fullWidth disabled={isPending} onClick={handleSubmit}>
          {isPending ? "Creating..." : "Create Block"}
        </Button>
      </div>
    </Drawer>
  );
}
