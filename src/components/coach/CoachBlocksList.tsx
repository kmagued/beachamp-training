"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCoachBlock } from "@/app/_actions/coach-blocks";
import type { CoachBlock } from "@/types/database";

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function describeBlock(b: CoachBlock): string {
  if (b.kind === 'one_time') {
    const dateStr = b.end_date && b.end_date !== b.start_date
      ? `${b.start_date} – ${b.end_date}`
      : (b.start_date ?? '');
    if (b.start_time === null) return `${dateStr} (all day)`;
    return `${dateStr} ${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`;
  }
  const day = b.day_of_week !== null ? DAY_NAMES[b.day_of_week] : '?';
  const window = `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`;
  if (b.effective_until) return `Every ${day} ${window} (until ${b.effective_until})`;
  return `Every ${day} ${window}`;
}

interface CoachBlocksListProps {
  blocks: CoachBlock[];
  onChange: () => void;
}

export function CoachBlocksList({ blocks, onChange }: CoachBlocksListProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteCoachBlock(id);
      setConfirmId(null);
      if ('error' in res) {
        console.error("[CoachBlocksList] delete failed:", res.error);
      }
      onChange();
    });
  }

  if (blocks.length === 0) {
    return (
      <div className="mt-6 p-4 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
        No blocks. Use &ldquo;Block Time&rdquo; to mark unavailability.
      </div>
    );
  }

  const sorted = [...blocks].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'one_time' ? -1 : 1;
    if (a.kind === 'one_time') return (a.start_date ?? '').localeCompare(b.start_date ?? '');
    return (a.day_of_week ?? 0) - (b.day_of_week ?? 0);
  });

  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Blocks</h3>
      <div className="space-y-1">
        {sorted.map((b) => (
          <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 bg-white text-sm">
            <div className="min-w-0">
              <p className="text-slate-900 truncate">{describeBlock(b)}</p>
              {b.reason && <p className="text-xs text-slate-400 truncate">{b.reason}</p>}
            </div>
            {confirmId === b.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={isPending}
                  className="text-xs font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  disabled={isPending}
                  className="text-xs font-medium px-2 py-1 rounded text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmId(b.id)}
                className="text-slate-400 hover:text-red-500 p-1.5 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
