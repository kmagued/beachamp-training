"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Drawer } from "@/components/ui";
import { playerBreakdown, type ScoreRow, type Standing } from "@/lib/king-of-court/leaderboard";
import { formatDay, formatMonth, formatTime, ordinal } from "@/lib/king-of-court/format";

/** One player's month in one group: the headline numbers, then every session they were scored in */
export function PlayerBreakdownDrawer({
  open,
  onClose,
  playerName,
  groupName,
  month,
  standing,
  scores,
}: {
  open: boolean;
  onClose: () => void;
  playerName: string;
  groupName: string;
  month: string;
  /** undefined when nobody is selected */
  standing: Standing | undefined;
  /** The group's rows for the month: a place in a session needs everyone's points */
  scores: ScoreRow[];
}) {
  const rows = standing ? playerBreakdown(scores, standing.player_id) : [];
  const stats: [string, string | number][] = standing
    ? [
        ["Rank", `#${standing.rank}`],
        ["Points", standing.total],
        ["Sessions", standing.sessions],
        ["Best", standing.best],
      ]
    : [];

  return (
    <Drawer open={open} onClose={onClose} title={playerName}>
      {standing && (
        <div className="space-y-5">
          <p className="text-xs text-slate-500">
            {groupName} · {formatMonth(month, "long")}
          </p>

          <div className="grid grid-cols-4 gap-2">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-2 py-3 text-center">
                <p className="text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
                <p className="text-[11px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Sessions</p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
              {rows.map((r) => (
                // Opens that day's Daily Report on Scores, where a wrong score is fixed
                <Link
                  key={`${r.schedule_session_id}|${r.session_date}`}
                  href={`/admin/daily-report?date=${r.session_date}&tab=scores`}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{formatDay(r.session_date)}</span>
                    <span className="block text-xs text-slate-400">{formatTime(r.start_time)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-slate-900 tabular-nums">{r.points} pts</span>
                    <span className="block text-xs text-slate-400 tabular-nums">
                      {ordinal(r.place)} of {r.fieldSize}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
