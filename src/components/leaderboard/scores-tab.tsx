"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Toast } from "@/components/ui";
import { Loader2, Check, Clock, Lock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { saveKingOfCourtScores } from "@/app/_actions/king-of-court";
import { parsePoints } from "@/lib/king-of-court/points";
import { applySavedScores, buildSavePayload, hasUnsavedChanges } from "@/lib/king-of-court/save";
import { formatMonth, formatTime } from "@/lib/king-of-court/format";
import { monthOfDate } from "@/lib/king-of-court/month";

interface GroupSession {
  id: string;
  start_time: string;
  end_time: string;
  location: string | null;
  end_date: string | null;
  created_at: string;
  groups: { name: string; level: string | null; in_leaderboard: boolean } | null;
}

interface PresentPlayer {
  id: string;
  first_name: string;
  last_name: string;
}

interface SessionScores {
  /** Whether any attendance has been saved for this session on this date */
  attendanceLogged: boolean;
  /** Players saved as present, by name */
  players: PresentPlayer[];
  /** Points stored before editing: player id -> points */
  saved: Record<string, number>;
  /** The text in each player's box now: player id -> text */
  inputs: Record<string, string>;
}

/** One box per present player, filled with their stored points or left blank */
function boxesFor(players: PresentPlayer[], saved: Record<string, number>): Record<string, string> {
  return Object.fromEntries(players.map((p) => [p.id, p.id in saved ? String(saved[p.id]) : ""]));
}

/**
 * King of Court scoring for a date: a card per group session on the leaderboard. Used by the
 * Daily Report for the whole day, and by a session's page for that one session.
 */
export function ScoresTab({
  date,
  onOpenAttendance,
  scheduleSessionId,
}: {
  date: string;
  onOpenAttendance: () => void;
  /** Only this session, instead of every session that day */
  scheduleSessionId?: string;
}) {
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [bySession, setBySession] = useState<Record<string, SessionScores>>({});
  const [loading, setLoading] = useState(true);
  /** The date's leaderboard month is closed: its scores are shown but can't be changed */
  const [closed, setClosed] = useState(false);
  const month = monthOfDate(date);
  /** Bumped to reload after the server refused a save because attendance moved on */
  const [reloadKey, setReloadKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [, startTransition] = useTransition();
  const boxRefs = useRef<Record<string, HTMLInputElement | null>>({});
  /** The date on screen now: a save that returns after the date changed must not touch the new page */
  const dateRef = useRef(date);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const dayOfWeek = new Date(date + "T00:00:00").getDay();

      let sessionQuery = supabase
        .from("schedule_sessions")
        .select("id, start_time, end_time, location, end_date, created_at, groups(name, level, in_leaderboard)")
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true)
        .eq("session_type", "group");
      if (scheduleSessionId) sessionQuery = sessionQuery.eq("id", scheduleSessionId);
      const { data: sessionData } = await sessionQuery.order("start_time");

      if (cancelled) return;

      // Same rule as the Attendance and Coaches tabs: a recurring session runs from the
      // day it was created until its end_date. Groups off the leaderboard (e.g. Private
      // Session) don't play King of Court, so they get no card.
      const sessionRows = ((sessionData || []) as unknown as GroupSession[]).filter((s) => {
        if (s.groups?.in_leaderboard === false) return false;
        if (s.end_date && s.end_date < date) return false;
        if (s.created_at.slice(0, 10) > date) return false;
        return true;
      });
      const sessionIds = sessionRows.map((s) => s.id);

      const [{ data: attendance }, { data: scores }, { data: closeRow }] = await Promise.all([
        sessionIds.length > 0
          ? supabase
              .from("attendance")
              .select("player_id, status, schedule_session_id, profiles!attendance_player_id_fkey(id, first_name, last_name)")
              .eq("session_date", date)
              .in("schedule_session_id", sessionIds)
          : Promise.resolve({ data: [] as unknown[] }),
        sessionIds.length > 0
          ? supabase
              .from("king_of_court_scores")
              .select("player_id, schedule_session_id, points")
              .eq("session_date", date)
              .in("schedule_session_id", sessionIds)
          : Promise.resolve({ data: [] as unknown[] }),
        supabase.from("leaderboard_month_closes").select("month").eq("month", month).maybeSingle(),
      ]);

      if (cancelled) return;

      const attendanceRows = (attendance || []) as unknown as {
        player_id: string;
        status: string;
        schedule_session_id: string;
        profiles: PresentPlayer | null;
      }[];
      const scoreRows = (scores || []) as { player_id: string; schedule_session_id: string; points: number }[];

      const next: Record<string, SessionScores> = {};
      for (const s of sessionRows) {
        // Any saved row, present or not, means attendance was logged for this session
        const logged = attendanceRows.filter((a) => a.schedule_session_id === s.id);
        const players = logged
          .filter((a) => a.status === "present" && a.profiles)
          .map((a) => a.profiles as PresentPlayer)
          .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
        const saved: Record<string, number> = {};
        for (const sc of scoreRows) {
          if (sc.schedule_session_id === s.id) saved[sc.player_id] = sc.points;
        }
        next[s.id] = { attendanceLogged: logged.length > 0, players, saved, inputs: boxesFor(players, saved) };
      }

      setSessions(sessionRows);
      setBySession(next);
      setClosed(!!closeRow);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reloadKey, scheduleSessionId]);

  function setBox(sessionId: string, playerId: string, text: string) {
    setBySession((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], inputs: { ...prev[sessionId].inputs, [playerId]: text } },
    }));
  }

  function clearBoxes(sessionId: string) {
    setBySession((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], inputs: boxesFor(prev[sessionId].players, {}) },
    }));
  }

  /** Enter moves to the next player's box, so a column of scores can be typed in one go */
  function focusNext(sessionId: string, index: number) {
    const players = bySession[sessionId].players;
    const next = players[index + 1];
    if (next) boxRefs.current[`${sessionId}:${next.id}`]?.focus();
    else boxRefs.current[`${sessionId}:${players[index].id}`]?.blur();
  }

  function handleSave(sessionId: string) {
    const current = bySession[sessionId];
    const payload = buildSavePayload(current.inputs, current.saved);
    if (payload.invalid_player_ids.length > 0) return;

    const savedFor = { sessionId, date };
    setSavingId(sessionId);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof saveKingOfCourtScores>>;
      try {
        res = await saveKingOfCourtScores({
          schedule_session_id: sessionId,
          session_date: date,
          scores: payload.scores,
          cleared_player_ids: payload.cleared_player_ids,
        });
      } catch {
        // No connection (common on a phone at the courts): keep the typed scores so Save can be retried
        setSavingId(null);
        setToast({ message: "Couldn't reach the server. Your scores are still here, so try Save again.", variant: "error" });
        return;
      }
      setSavingId(null);

      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        // Attendance changed since this tab loaded: show who is present now
        if (res.reload) setReloadKey((k) => k + 1);
        return;
      }

      const saved = Object.fromEntries(payload.scores.map((sc) => [sc.player_id, sc.points]));
      setBySession((prev) => applySavedScores(prev, savedFor, dateRef.current, saved));
      if (savedFor.date === dateRef.current) setToast({ message: "Scores saved", variant: "success" });
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-5 w-40 bg-slate-200 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-full bg-slate-100 rounded" />
              <div className="h-4 w-3/4 bg-slate-100 rounded" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    const weekday = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
    return (
      <Card>
        <div className="text-center py-10">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">
            {scheduleSessionId ? "Nothing to score" : "No group sessions"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {scheduleSessionId
              ? `This session isn't on the schedule on ${weekday}`
              : `There are no group sessions on ${weekday}`}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
      {closed && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <Lock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-600">
            The {formatMonth(month, "long")} leaderboard is closed, so these scores are read-only.{" "}
            <Link href={`/admin/leaderboard?month=${month}`} className="font-semibold text-primary hover:underline">
              Open the Leaderboard
            </Link>
          </p>
        </div>
      )}
      {sessions.map((session) => {
        const s = bySession[session.id];
        const invalid = new Set(buildSavePayload(s.inputs, s.saved).invalid_player_ids);
        const scoredCount = s.players.filter((p) => typeof parsePoints(s.inputs[p.id] ?? "") === "number").length;
        const changed = hasUnsavedChanges(s.inputs, s.saved);
        const hasSaved = Object.keys(s.saved).length > 0;
        const isSaving = savingId === session.id;

        return (
          <Card key={session.id} className="p-0">
            <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900">{session.groups?.name}</h3>
                  {session.groups?.level && <Badge variant="neutral">{session.groups.level}</Badge>}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatTime(session.start_time)} – {formatTime(session.end_time)}
                  {session.location && ` · ${session.location}`}
                </p>
              </div>
              {s.players.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-400 tabular-nums">
                    {scoredCount}/{s.players.length} scored
                  </span>
                  {changed && !closed ? (
                    <Button
                      size="sm"
                      onClick={() => handleSave(session.id)}
                      disabled={invalid.size > 0 || savingId !== null}
                    >
                      {isSaving ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                        </span>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  ) : hasSaved ? (
                    <Badge variant="success">
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>

            {!s.attendanceLogged ? (
              <div className="px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Log attendance first. Only players marked present can be scored.</p>
                <Button size="sm" variant="secondary" onClick={onOpenAttendance}>
                  Attendance
                </Button>
              </div>
            ) : s.players.length === 0 ? (
              <p className="px-4 sm:px-5 py-4 border-t border-slate-100 text-xs text-slate-400">No players marked present</p>
            ) : (
              <>
                <div className="px-4 sm:px-5 py-2 bg-slate-50/50 border-y border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Present ({s.players.length})
                  </span>
                  {!closed && Object.values(s.inputs).some((t) => t.trim() !== "") && (
                    <button
                      type="button"
                      onClick={() => clearBoxes(session.id)}
                      className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {s.players.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                        {p.first_name[0]}{p.last_name[0]}
                      </div>
                      <p className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate">
                        {p.first_name} {p.last_name}
                      </p>
                      <input
                        ref={(el) => { boxRefs.current[`${session.id}:${p.id}`] = el; }}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        enterKeyHint="next"
                        autoComplete="off"
                        aria-label={`Points for ${p.first_name} ${p.last_name}`}
                        aria-invalid={invalid.has(p.id) || undefined}
                        disabled={closed}
                        value={s.inputs[p.id] ?? ""}
                        onChange={(e) => setBox(session.id, p.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            focusNext(session.id, i);
                          }
                        }}
                        className={cn(
                          "w-16 h-9 px-2 text-right text-sm tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500",
                          invalid.has(p.id)
                            ? "border-red-400 focus:ring-red-200"
                            : "border-slate-200 focus:ring-primary/20 focus:border-primary"
                        )}
                      />
                    </div>
                  ))}
                </div>
                <p className="px-4 sm:px-5 py-2 border-t border-slate-100 text-[11px] text-slate-400">
                  Blank = didn&apos;t play · 0 = played, no points
                </p>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
