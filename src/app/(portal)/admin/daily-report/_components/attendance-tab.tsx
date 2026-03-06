"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Toast, Drawer } from "@/components/ui";
import { Loader2, Check, Clock, Users, X, AlertTriangle, CheckCircle2, XCircle, Search, ChevronDown, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { submitAttendance, removeAttendanceRecords } from "@/app/_actions/training";
import { createPendingPaymentForSession } from "@/app/(portal)/admin/payments/actions";

interface ScheduleSession {
  id: string;
  group_id: string;
  start_time: string;
  end_time: string;
  location: string | null;
  groups: {
    id: string;
    name: string;
    level: string;
  };
}

interface GroupPlayer {
  player_id: string;
  profiles: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface AttendanceRecord {
  player_id: string;
  status: "present" | "absent" | "excused";
}

interface SessionAttendanceState {
  [playerId: string]: "present" | "absent" | "excused" | undefined;
}

export function AttendanceTab({ date }: { date: string }) {
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionPlayers, setSessionPlayers] = useState<Record<string, GroupPlayer[]>>({});
  const [attendanceState, setAttendanceState] = useState<Record<string, SessionAttendanceState>>({});
  const [savedSessions, setSavedSessions] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
  const [savedAttendanceState, setSavedAttendanceState] = useState<Record<string, SessionAttendanceState>>({});
  const [playerSessions, setPlayerSessions] = useState<Record<string, { remaining: number; total: number; end_date: string | null; status: string } | null>>({});
  const [packages, setPackages] = useState<{ id: string; price: number; name: string; session_count: number }[]>([]);
  const [paymentDialog, setPaymentDialog] = useState<{ session: ScheduleSession; players: GroupPlayer[]; playerPackages: Record<string, string> } | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setSavedSessions(new Set());

      // Get day of week (0=Sunday, 6=Saturday)
      const dayOfWeek = new Date(date + "T00:00:00").getDay();

      // Fetch schedule sessions for this day
      const { data: scheduleSessions } = await supabase
        .from("schedule_sessions")
        .select("id, group_id, start_time, end_time, location, groups(id, name, level)")
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true)
        .order("start_time");

      const sessionsData = (scheduleSessions || []) as unknown as ScheduleSession[];
      setSessions(sessionsData);

      if (sessionsData.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch players for each group
      const groupIds = [...new Set(sessionsData.map((s) => s.group_id))];
      const { data: allGroupPlayers } = await supabase
        .from("group_players")
        .select("player_id, group_id, profiles!group_players_player_id_fkey(id, first_name, last_name)")
        .in("group_id", groupIds)
        .eq("is_active", true);

      const playersByGroup: Record<string, GroupPlayer[]> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (allGroupPlayers || []).forEach((gp: any) => {
        const groupId = gp.group_id as string;
        if (!playersByGroup[groupId]) playersByGroup[groupId] = [];
        playersByGroup[groupId].push({
          player_id: gp.player_id,
          profiles: gp.profiles,
        });
      });
      setSessionPlayers(playersByGroup);

      // Fetch active + expired subscriptions for all players (most recent per player)
      const allPlayerIds = [...new Set((allGroupPlayers || []).map((gp: { player_id: string }) => gp.player_id))];
      if (allPlayerIds.length > 0) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("player_id, sessions_remaining, sessions_total, end_date, status")
          .in("player_id", allPlayerIds)
          .in("status", ["active", "expired"])
          .order("created_at", { ascending: false });

        const sessionsMap: Record<string, { remaining: number; total: number; end_date: string | null; status: string } | null> = {};
        (subs || []).forEach((s: { player_id: string; sessions_remaining: number; sessions_total: number; end_date: string | null; status: string }) => {
          // Keep the first (most recent) subscription per player; prefer active over expired
          if (!sessionsMap[s.player_id] || (sessionsMap[s.player_id]!.status === "expired" && s.status === "active")) {
            sessionsMap[s.player_id] = { remaining: s.sessions_remaining, total: s.sessions_total, end_date: s.end_date, status: s.status };
          }
        });
        setPlayerSessions(sessionsMap);
      }

      // Fetch existing attendance for this date
      const sessionIds = sessionsData.map((s) => s.id);
      const { data: existingAtt } = await supabase
        .from("attendance")
        .select("player_id, status, schedule_session_id")
        .eq("session_date", date)
        .in("schedule_session_id", sessionIds);

      const attBySession: Record<string, AttendanceRecord[]> = {};
      (existingAtt || []).forEach((a: { schedule_session_id: string } & AttendanceRecord) => {
        if (!attBySession[a.schedule_session_id]) attBySession[a.schedule_session_id] = [];
        attBySession[a.schedule_session_id].push(a);
      });
      // Initialize attendance state — only set status for players with existing records
      const initialState: Record<string, SessionAttendanceState> = {};
      sessionsData.forEach((session) => {
        const sessionState: SessionAttendanceState = {};
        const existing = attBySession[session.id] || [];

        existing.forEach((a) => {
          sessionState[a.player_id] = a.status;
        });

        initialState[session.id] = sessionState;

        // Mark sessions that already have attendance as saved
        if (existing.length > 0) {
          setSavedSessions((prev) => new Set([...prev, session.id]));
        }
      });
      setAttendanceState(initialState);
      setSavedAttendanceState(JSON.parse(JSON.stringify(initialState)));
      // Fetch all active packages for payment creation
      const { data: pkgs } = await supabase
        .from("packages")
        .select("id, price, name, session_count")
        .eq("is_active", true)
        .order("session_count", { ascending: true });
      if (pkgs) setPackages(pkgs);

      // Collapse all sessions by default
      setCollapsedSessions(new Set(sessionsData.map((s) => s.id)));
      setLoading(false);
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function markAll(sessionId: string, groupId: string, status: "present" | "absent") {
    const players = sessionPlayers[groupId] || [];
    setAttendanceState((prev) => {
      const sessionState: SessionAttendanceState = {};
      players.forEach((p) => { sessionState[p.player_id] = status; });
      return { ...prev, [sessionId]: sessionState };
    });
    setSavedSessions((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }

  function getZeroBalancePresentPlayers(session: ScheduleSession) {
    const state = attendanceState[session.id] || {};
    const saved = savedAttendanceState[session.id] || {};
    const players = sessionPlayers[session.group_id] || [];

    return players.filter((gp) => {
      const status = state[gp.player_id];
      const wasPreviouslyPresent = saved[gp.player_id] === "present";
      // Only flag newly marked present players (not already saved as present)
      if (status !== "present" || wasPreviouslyPresent) return false;
      const sub = playerSessions[gp.player_id];
      return !sub || sub.remaining <= 0 || sub.status === "expired";
    });
  }

  function handleSaveSession(session: ScheduleSession) {
    const state = attendanceState[session.id] || {};
    const saved = savedAttendanceState[session.id] || {};
    const records = Object.entries(state)
      .filter(([, status]) => status !== undefined)
      .map(([player_id, status]) => ({
        player_id,
        status: status!,
      }));

    const removedPlayerIds = Object.keys(saved)
      .filter((pid) => saved[pid] !== undefined && (state[pid] === undefined || !(pid in state)));

    if (records.length === 0 && removedPlayerIds.length === 0) return;

    // Check for players with no balance being marked present
    const zeroBalancePlayers = getZeroBalancePresentPlayers(session);
    const defaultPkg = packages.find((p) => p.session_count === 1) || packages[0];
    if (zeroBalancePlayers.length > 0 && defaultPkg) {
      const playerPackages: Record<string, string> = {};
      zeroBalancePlayers.forEach((gp) => { playerPackages[gp.player_id] = defaultPkg.id; });
      setPaymentDialog({ session, players: zeroBalancePlayers, playerPackages });
      return;
    }

    executeSave(session, records, removedPlayerIds);
  }

  function executeSave(
    session: ScheduleSession,
    records: { player_id: string; status: "present" | "absent" | "excused" }[],
    removedPlayerIds: string[],
    playerPackages: Record<string, string> = {}
  ) {
    setSavingSessionId(session.id);
    startTransition(async () => {
      // Remove attendance for deselected players
      if (removedPlayerIds.length > 0) {
        const removeRes = await removeAttendanceRecords({
          group_id: session.group_id,
          schedule_session_id: session.id,
          session_date: date,
          player_ids: removedPlayerIds,
        });
        if ("error" in removeRes) {
          setSavingSessionId(null);
          setToast({ message: removeRes.error as string, variant: "error" });
          return;
        }
      }

      // Submit remaining records (if any)
      if (records.length > 0) {
        const res = await submitAttendance({
          group_id: session.group_id,
          schedule_session_id: session.id,
          session_date: date,
          records,
        });
        if (!("success" in res && res.success)) {
          setSavingSessionId(null);
          const errorMsg = "error" in res && typeof res.error === "string" ? res.error : "Failed to save attendance";
          setToast({ message: errorMsg, variant: "error" });
          return;
        }

        // Update displayed sessions_remaining from the response
        if ("results" in res && Array.isArray(res.results)) {
          setPlayerSessions((prev) => {
            const updated = { ...prev };
            for (const r of res.results) {
              if (r.sessions_remaining !== null && updated[r.player_id]) {
                updated[r.player_id] = { ...updated[r.player_id]!, remaining: r.sessions_remaining };
              }
            }
            return updated;
          });
        }
      }

      // Create pending payments for zero-balance players
      let paymentsCreated = 0;
      const playerIds = Object.keys(playerPackages);
      if (playerIds.length > 0) {
        for (const playerId of playerIds) {
          const pkg = packages.find((p) => p.id === playerPackages[playerId]);
          if (!pkg) continue;
          const payRes = await createPendingPaymentForSession({
            player_id: playerId,
            package_id: pkg.id,
            amount: pkg.price,
            session_date: date,
          });
          if ("success" in payRes) paymentsCreated++;
        }
      }

      // Re-fetch subscriptions for removed players (their sessions were re-credited)
      if (removedPlayerIds.length > 0) {
        const { data: updatedSubs } = await supabase
          .from("subscriptions")
          .select("player_id, sessions_remaining, sessions_total, end_date, status")
          .in("player_id", removedPlayerIds)
          .in("status", ["active", "expired"])
          .order("created_at", { ascending: false });

        if (updatedSubs) {
          setPlayerSessions((prev) => {
            const updated = { ...prev };
            for (const pid of removedPlayerIds) {
              delete updated[pid];
            }
            for (const s of updatedSubs) {
              if (!updated[s.player_id] || (updated[s.player_id]!.status === "expired" && s.status === "active")) {
                updated[s.player_id] = { remaining: s.sessions_remaining, total: s.sessions_total, end_date: s.end_date, status: s.status };
              }
            }
            return updated;
          });
        }
      }

      setSavingSessionId(null);
      setSavedSessions((prev) => new Set([...prev, session.id]));
      setSavedAttendanceState((prev) => ({
        ...prev,
        [session.id]: { ...attendanceState[session.id] },
      }));

      const msg = paymentsCreated > 0
        ? `Attendance saved. ${paymentsCreated} pending payment${paymentsCreated > 1 ? "s" : ""} created.`
        : "Attendance saved successfully";
      setToast({ message: msg, variant: "success" });
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
    return (
      <Card>
        <div className="text-center py-10">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No sessions scheduled</p>
          <p className="text-xs text-slate-400 mt-1">
            There are no training sessions on{" "}
            {new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })}
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
      {sessions.map((session) => {
        const players = sessionPlayers[session.group_id] || [];
        const state = attendanceState[session.id] || {};
        const loggedCount = Object.values(state).filter((s) => s !== undefined).length;
        const presentCount = Object.values(state).filter((s) => s === "present").length;
        const absentCount = Object.values(state).filter((s) => s === "absent").length;
        const excusedCount = Object.values(state).filter((s) => s === "excused").length;
        const isSaved = savedSessions.has(session.id);
        const isSaving = savingSessionId === session.id;
        const hasEntries = loggedCount > 0;
        const hasChanges = (() => {
          const saved = savedAttendanceState[session.id] || {};
          const allKeys = new Set([...Object.keys(saved), ...Object.keys(state)]);
          for (const key of allKeys) {
            if ((saved[key] || undefined) !== (state[key] || undefined)) return true;
          }
          return false;
        })();

        const query = searchQuery.toLowerCase().trim();
        const sortedPlayers = [...players].sort((a, b) => {
          const aLogged = state[a.player_id] !== undefined ? 0 : 1;
          const bLogged = state[b.player_id] !== undefined ? 0 : 1;
          if (aLogged !== bLogged) return aLogged - bLogged;
          return `${a.profiles.first_name} ${a.profiles.last_name}`.localeCompare(`${b.profiles.first_name} ${b.profiles.last_name}`);
        });
        const filteredPlayers = query
          ? sortedPlayers.filter((gp) =>
              `${gp.profiles.first_name} ${gp.profiles.last_name}`.toLowerCase().includes(query)
            )
          : sortedPlayers;

        const isCollapsed = collapsedSessions.has(session.id);

        return (
          <Card key={session.id} className="p-0">
            <button
              type="button"
              onClick={() => setCollapsedSessions((prev) => {
                const next = new Set(prev);
                if (next.has(session.id)) next.delete(session.id);
                else next.add(session.id);
                return next;
              })}
              className="w-full px-4 sm:px-5 py-3 sm:py-4 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {session.groups.name}
                      </h3>
                      <Badge variant="neutral">{session.groups.level}</Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {session.start_time?.slice(0, 5)} – {session.end_time?.slice(0, 5)}
                      {session.location && ` · ${session.location}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {hasEntries ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-600 font-medium">{presentCount}</span>
                      <span className="text-red-500 font-medium">{absentCount}</span>
                      <span className="text-amber-500 font-medium">{excusedCount}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not logged</span>
                  )}
                  {isSaved ? (
                    <Badge variant="success">
                      <span className="flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    </Badge>
                  ) : (hasEntries || hasChanges) ? (
                    <Button
                      size="sm"
                      onClick={() => handleSaveSession(session)}
                      disabled={isPending}
                    >
                      {isSaving ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                        </span>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>
            </button>

            {!isCollapsed && <>
              <div className="px-4 sm:px-5 py-2 bg-slate-50/50 border-b border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Players</span>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {players.length > 0 && (
                      <>
                        <button
                          onClick={() => markAll(session.id, session.group_id, "present")}
                          className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" /> All Present
                        </button>
                        <button
                          onClick={() => markAll(session.id, session.group_id, "absent")}
                          className="flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-600 transition-colors"
                        >
                          <XCircle className="w-3 h-3" /> All Absent
                        </button>
                        {hasChanges && (
                          <button
                            onClick={() => {
                              const saved = savedAttendanceState[session.id] || {};
                              setAttendanceState((prev) => ({ ...prev, [session.id]: { ...saved } }));
                              const hasSaved = Object.values(saved).some((s) => s !== undefined);
                              if (hasSaved) {
                                setSavedSessions((prev) => new Set([...prev, session.id]));
                              } else {
                                setSavedSessions((prev) => { const n = new Set(prev); n.delete(session.id); return n; });
                              }
                            }}
                            className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" /> Reset
                          </button>
                        )}
                        {hasEntries && (
                          <button
                            onClick={() => {
                              setAttendanceState((prev) => ({ ...prev, [session.id]: {} }));
                              setSavedSessions((prev) => { const n = new Set(prev); n.delete(session.id); return n; });
                            }}
                            className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Clear
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {players.length > 5 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search players..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-slate-400"
                    />
                  </div>
                )}
              </div>

              {players.length === 0 ? (
                <div className="px-4 sm:px-5 py-6 text-center">
                  <Users className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No players in this group</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredPlayers.map((gp) => {
                    const status = state[gp.player_id];
                    const sub = playerSessions[gp.player_id];
                    return (
                      <div
                        key={gp.player_id}
                        className="flex items-center gap-3 px-4 sm:px-5 py-2.5 sm:py-3"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                          {gp.profiles.first_name[0]}{gp.profiles.last_name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {gp.profiles.first_name} {gp.profiles.last_name}
                          </p>
                          {sub ? (
                            <p className={cn(
                              "text-[11px]",
                              sub.status === "expired"
                                ? "text-red-500 font-medium"
                                : sub.remaining <= 2 || (sub.end_date && Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000) <= 3)
                                  ? "text-red-500 font-medium"
                                  : "text-slate-400"
                            )}>
                              {sub.status === "expired"
                                ? `Expired · ${sub.remaining}/${sub.total} sessions left`
                                : `${sub.remaining}/${sub.total} sessions left`}
                              {sub.status === "active" && sub.end_date && (() => {
                                const days = Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / 86400000);
                                if (days <= 0) return " · Expires today";
                                if (days <= 3) return ` · Expires in ${days}d`;
                                return null;
                              })()}
                            </p>
                          ) : (
                            <p className="text-[11px] text-red-400">No active subscription</p>
                          )}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              setAttendanceState((prev) => ({
                                ...prev,
                                [session.id]: { ...prev[session.id], [gp.player_id]: status === "present" ? undefined : "present" },
                              }));
                              setSavedSessions((prev) => { const n = new Set(prev); n.delete(session.id); return n; });
                            }}
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                              status === "present"
                                ? "bg-emerald-500 text-white"
                                : "bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                            )}
                            title="Present"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setAttendanceState((prev) => ({
                                ...prev,
                                [session.id]: { ...prev[session.id], [gp.player_id]: status === "absent" ? undefined : "absent" },
                              }));
                              setSavedSessions((prev) => { const n = new Set(prev); n.delete(session.id); return n; });
                            }}
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                              status === "absent"
                                ? "bg-red-500 text-white"
                                : "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            )}
                            title="Absent"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setAttendanceState((prev) => ({
                                ...prev,
                                [session.id]: { ...prev[session.id], [gp.player_id]: status === "excused" ? undefined : "excused" },
                              }));
                              setSavedSessions((prev) => { const n = new Set(prev); n.delete(session.id); return n; });
                            }}
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                              status === "excused"
                                ? "bg-amber-500 text-white"
                                : "bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                            )}
                            title="Excused"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {query && filteredPlayers.length === 0 && (
                    <div className="px-4 sm:px-5 py-4 text-center">
                      <p className="text-xs text-slate-400">No players match &ldquo;{searchQuery}&rdquo;</p>
                    </div>
                  )}
                </div>
              )}
            </>}

          </Card>
        );
      })}

      {/* Zero-balance payment drawer */}
      <Drawer
        open={!!paymentDialog}
        onClose={() => setPaymentDialog(null)}
        title="Players with no balance"
        footer={
          paymentDialog ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => setPaymentDialog(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  const dialog = paymentDialog;
                  setPaymentDialog(null);
                  const state = attendanceState[dialog.session.id] || {};
                  const saved = savedAttendanceState[dialog.session.id] || {};
                  const records = Object.entries(state)
                    .filter(([, s]) => s !== undefined)
                    .map(([player_id, s]) => ({ player_id, status: s! }));
                  const removedPlayerIds = Object.keys(saved)
                    .filter((pid) => saved[pid] !== undefined && (state[pid] === undefined || !(pid in state)));
                  executeSave(dialog.session, records, removedPlayerIds, dialog.playerPackages);
                }}
              >
                Save & Create Payments
              </Button>
            </div>
          ) : undefined
        }
      >
        {paymentDialog && (() => {
          const total = paymentDialog.players.reduce((sum, gp) => {
            const pkg = packages.find((p) => p.id === paymentDialog.playerPackages[gp.player_id]);
            return sum + (pkg?.price ?? 0);
          }, 0);
          return (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                The following players have no remaining sessions. A pending payment will be created for each.
              </p>

              <div className="space-y-3">
                {paymentDialog.players.map((gp) => {
                  const pkgId = paymentDialog.playerPackages[gp.player_id];
                  const playerPkg = packages.find((p) => p.id === pkgId);
                  return (
                    <div key={gp.player_id} className="bg-red-50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-[10px] font-bold text-red-600 shrink-0">
                          {gp.profiles.first_name[0]}{gp.profiles.last_name[0]}
                        </div>
                        <span className="text-xs font-medium text-slate-700">
                          {gp.profiles.first_name} {gp.profiles.last_name}
                        </span>
                        {playerPkg && (
                          <span className="ml-auto text-[11px] font-medium text-slate-500">{playerPkg.price} EGP</span>
                        )}
                      </div>
                      <select
                        value={pkgId}
                        onChange={(e) => setPaymentDialog((prev) => prev ? {
                          ...prev,
                          playerPackages: { ...prev.playerPackages, [gp.player_id]: e.target.value }
                        } : null)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        {packages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} — {pkg.price} EGP
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {paymentDialog.players.length > 1 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-xs font-medium text-slate-500">Total</span>
                  <span className="text-sm font-semibold text-slate-900">{total} EGP</span>
                </div>
              )}
            </div>
          );
        })()}
      </Drawer>
    </div>
  );
}
