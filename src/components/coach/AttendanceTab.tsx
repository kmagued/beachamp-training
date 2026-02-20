"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Badge, Skeleton, Drawer } from "@/components/ui";
import { submitAttendance } from "@/app/_actions/training";
import {
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  UserCheck,
  UserX,
  Clock,
} from "lucide-react";
import type { AttendanceStatus } from "@/types/database";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  sessions_remaining: number | null;
  subscription_status: string | null;
}

interface AttendanceRecord {
  player_id: string;
  status: AttendanceStatus | null;
  notes: string;
}

interface AttendanceTabProps {
  scheduleSessionId: string;
  groupId: string;
  groupName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function AttendanceTab({
  scheduleSessionId,
  groupId,
  groupName,
  sessionDate,
  startTime,
  endTime,
}: AttendanceTabProps) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [records, setRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; warnings?: string[] } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existingAttendance, setExistingAttendance] = useState<Map<string, string>>(new Map());

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function loadPlayers() {
      setLoadingPlayers(true);
      setResult(null);

      // Get active players in the group
      const { data: groupPlayers } = await supabase
        .from("group_players")
        .select("player_id, profiles!group_players_player_id_fkey(id, first_name, last_name, avatar_url)")
        .eq("group_id", groupId)
        .eq("is_active", true);

      if (!groupPlayers) {
        setLoadingPlayers(false);
        return;
      }

      // Get subscriptions for these players
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerIds = groupPlayers.map((gp: any) => gp.profiles?.id).filter(Boolean);

      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("player_id, sessions_remaining, status")
        .in("player_id", playerIds.length > 0 ? playerIds : ["__none__"])
        .eq("status", "active");

      const subMap = new Map<string, { remaining: number; status: string }>();
      if (subscriptions) {
        for (const sub of subscriptions) {
          subMap.set(sub.player_id, { remaining: sub.sessions_remaining, status: sub.status });
        }
      }

      // Check for existing attendance on this date + session
      const { data: existingAtt } = await supabase
        .from("attendance")
        .select("player_id, status")
        .eq("group_id", groupId)
        .eq("session_date", sessionDate)
        .eq("schedule_session_id", scheduleSessionId);

      const existingMap = new Map<string, string>();
      if (existingAtt) {
        for (const att of existingAtt) {
          existingMap.set(att.player_id, att.status);
        }
      }
      setExistingAttendance(existingMap);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerRows: PlayerRow[] = groupPlayers.map((gp: any) => {
        const sub = subMap.get(gp.profiles?.id);
        return {
          id: gp.profiles?.id || "",
          first_name: gp.profiles?.first_name || "",
          last_name: gp.profiles?.last_name || "",
          avatar_url: gp.profiles?.avatar_url,
          sessions_remaining: sub?.remaining ?? null,
          subscription_status: sub?.status ?? null,
        };
      }).filter((p: PlayerRow) => p.id);

      setPlayers(playerRows);

      // Initialize records — pre-fill from existing attendance or leave null
      const initialRecords = new Map<string, AttendanceRecord>();
      for (const p of playerRows) {
        const existingStatus = existingMap.get(p.id);
        initialRecords.set(p.id, {
          player_id: p.id,
          status: (existingStatus as AttendanceStatus) || null,
          notes: "",
        });
      }
      setRecords(initialRecords);
      setLoadingPlayers(false);
    }

    loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, sessionDate, scheduleSessionId]);

  function setPlayerStatus(playerId: string, status: AttendanceStatus) {
    setRecords((prev) => {
      const next = new Map(prev);
      const existing = next.get(playerId);
      if (existing) {
        next.set(playerId, { ...existing, status });
      }
      return next;
    });
  }

  function setPlayerNotes(playerId: string, notes: string) {
    setRecords((prev) => {
      const next = new Map(prev);
      const existing = next.get(playerId);
      if (existing) {
        next.set(playerId, { ...existing, notes });
      }
      return next;
    });
  }

  function selectAllPresent() {
    setRecords((prev) => {
      const next = new Map(prev);
      for (const [id, record] of next) {
        next.set(id, { ...record, status: "present" });
      }
      return next;
    });
  }

  const markedRecords = Array.from(records.values()).filter((r) => r.status !== null);
  const presentCount = markedRecords.filter((r) => r.status === "present").length;
  const absentCount = markedRecords.filter((r) => r.status === "absent").length;
  const excusedCount = markedRecords.filter((r) => r.status === "excused").length;
  const unmarkedCount = players.length - markedRecords.length;
  const allMarked = unmarkedCount === 0 && players.length > 0;
  const hasExistingAttendance = existingAttendance.size > 0;

  function handleSubmit() {
    if (!allMarked) return;
    setSubmitError(null);

    startTransition(async () => {
      const attendanceRecords = Array.from(records.values())
        .filter((r) => r.status !== null)
        .map((r) => ({
          player_id: r.player_id,
          status: r.status as "present" | "absent" | "excused",
          notes: r.notes || undefined,
        }));

      const res = await submitAttendance({
        group_id: groupId,
        schedule_session_id: scheduleSessionId,
        session_date: sessionDate,
        records: attendanceRecords,
      });

      if ("error" in res) {
        setSubmitError((res as { error: string }).error);
      } else {
        const warnings: string[] = [];
        if ("results" in res) {
          for (const r of (res as { results: { player_id: string; sessions_remaining: number | null }[] }).results) {
            if (r.sessions_remaining !== null && r.sessions_remaining <= 0) {
              const player = players.find((p) => p.id === r.player_id);
              if (player) {
                warnings.push(`${player.first_name} ${player.last_name} has ${r.sessions_remaining} sessions remaining`);
              }
            }
          }
        }
        setResult({ success: true, warnings });
        setShowConfirm(false);
        setSubmitError(null);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-slate-400">
            {formatTime(startTime)} - {formatTime(endTime)} &middot; {sessionDate}
          </p>
        </div>
        {players.length > 0 && (
          <Button size="sm" variant="secondary" onClick={selectAllPresent} fullWidth className="sm:w-auto">
            <span className="flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All Present
            </span>
          </Button>
        )}
      </div>

      {hasExistingAttendance && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Attendance already logged for this session. Submitting will update existing records.
          </div>
        </div>
      )}

      {loadingPlayers ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="w-8 h-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          No players assigned to this group yet
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {players.map((player) => {
            const record = records.get(player.id);
            const isExpanded = expandedNotes.has(player.id);
            const hasLowBalance = player.sessions_remaining !== null && player.sessions_remaining <= 2;
            const hasNoBalance = player.sessions_remaining !== null && player.sessions_remaining <= 0;

            return (
              <div key={player.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {player.first_name[0]}{player.last_name[0]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {player.first_name} {player.last_name}
                    </p>
                    <div className="flex items-center gap-2">
                      {player.sessions_remaining !== null ? (
                        <span className={`text-xs ${hasNoBalance ? "text-red-500 font-medium" : hasLowBalance ? "text-amber-500" : "text-slate-400"}`}>
                          {player.sessions_remaining} sessions left
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">No active subscription</span>
                      )}
                      {hasNoBalance && (
                        <Badge variant="danger">0 balance</Badge>
                      )}
                    </div>
                  </div>

                  {/* Status Buttons — desktop */}
                  <div className="hidden sm:flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setPlayerStatus(player.id, "present")}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        record?.status === "present"
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                      }`}
                      title="Present"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPlayerStatus(player.id, "absent")}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        record?.status === "absent"
                          ? "bg-red-500 text-white"
                          : "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      }`}
                      title="Absent"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPlayerStatus(player.id, "excused")}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        record?.status === "excused"
                          ? "bg-amber-500 text-white"
                          : "bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                      }`}
                      title="Excused"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setExpandedNotes((prev) => {
                          const next = new Set(prev);
                          if (next.has(player.id)) next.delete(player.id);
                          else next.add(player.id);
                          return next;
                        });
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 text-slate-400 hover:bg-slate-200 transition-colors"
                      title="Add note"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Status Buttons — mobile */}
                <div className="sm:hidden flex gap-1.5 mt-2 ml-12">
                  <button
                    onClick={() => setPlayerStatus(player.id, "present")}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      record?.status === "present"
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPlayerStatus(player.id, "absent")}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      record?.status === "absent"
                        ? "bg-red-500 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPlayerStatus(player.id, "excused")}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                      record?.status === "excused"
                        ? "bg-amber-500 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setExpandedNotes((prev) => {
                        const next = new Set(prev);
                        if (next.has(player.id)) next.delete(player.id);
                        else next.add(player.id);
                        return next;
                      });
                    }}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 text-slate-400 shrink-0 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Notes (expandable) */}
                {isExpanded && (
                  <div className="mt-2 ml-12">
                    <input
                      type="text"
                      value={record?.notes || ""}
                      onChange={(e) => setPlayerNotes(player.id, e.target.value)}
                      placeholder="Optional note..."
                      className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Bar */}
      {players.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-600">
                <UserCheck className="w-4 h-4" /> {presentCount}
              </span>
              <span className="flex items-center gap-1 text-red-500">
                <UserX className="w-4 h-4" /> {absentCount}
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                <Clock className="w-4 h-4" /> {excusedCount}
              </span>
              {unmarkedCount > 0 && (
                <span className="text-slate-400">{unmarkedCount} unmarked</span>
              )}
            </div>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={!allMarked || isPending}
              size="sm"
              fullWidth
              className="sm:w-auto"
            >
              {isPending ? "Submitting..." : "Submit Attendance"}
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Drawer */}
      <Drawer
        open={showConfirm}
        onClose={() => { setShowConfirm(false); setSubmitError(null); }}
        title="Confirm Attendance"
      >
        <div className="flex flex-col h-full -mb-5 sm:-mb-6">
          <div className="flex-1">
            <p className="text-sm text-slate-500 mb-4">
              You&apos;re marking attendance for <span className="font-medium text-slate-900">{groupName}</span> — {formatTime(startTime)} session on {sessionDate}
            </p>
            <div className="flex items-center gap-4 text-sm mb-4 bg-slate-50 rounded-lg p-3">
              <span className="text-emerald-600">{presentCount} present</span>
              <span className="text-red-500">{absentCount} absent</span>
              <span className="text-amber-500">{excusedCount} excused</span>
            </div>
            {hasExistingAttendance && (
              <p className="text-xs text-amber-600 mb-4">
                This will update existing attendance records.
              </p>
            )}
          </div>

          <div className="sticky bottom-0 pt-3 pb-5 sm:pb-6 border-t border-slate-200 bg-white -mx-5 px-5 sm:-mx-6 sm:px-6">
            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                <X className="w-4 h-4 mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={isPending} fullWidth>
                {isPending ? "Submitting..." : "Confirm"}
              </Button>
              <Button variant="secondary" onClick={() => { setShowConfirm(false); setSubmitError(null); }} disabled={isPending} fullWidth>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      {/* Success Toast */}
      {result?.success && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 sm:max-w-sm bg-emerald-50 border-emerald-200 border rounded-lg p-4 shadow-lg">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-700">
                Attendance submitted successfully!
              </p>
              {result.warnings && result.warnings.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
