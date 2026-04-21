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
  session_type: "group" | "private";
  group_id: string | null;
  player_id: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  end_date: string | null;
  created_at: string;
  groups: {
    id: string;
    name: string;
    level: string;
  } | null;
  private_players: {
    profiles: {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
  }[];
}

interface GroupPlayer {
  player_id: string;
  profiles: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface PlayerSubscription {
  id: string;
  remaining: number;
  total: number;
  end_date: string | null;
  status: string;
  package_name: string;
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
  const [playerSessions, setPlayerSessions] = useState<Record<string, PlayerSubscription[]>>({});
  const [packages, setPackages] = useState<{ id: string; price: number; name: string; session_count: number }[]>([]);
  const [paymentDialog, setPaymentDialog] = useState<{ session: ScheduleSession; players: GroupPlayer[]; playerPackages: Record<string, string> } | null>(null);
  const [chosenSubs, setChosenSubs] = useState<Record<string, string>>({});
  const [multiSubDialog, setMultiSubDialog] = useState<{ session: ScheduleSession; records: { player_id: string; status: "present" | "absent" | "excused" }[]; removedPlayerIds: string[]; multiSubPlayers: GroupPlayer[] } | null>(null);
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

      // Fetch schedule sessions for this day (group + private)
      const { data: scheduleSessions } = await supabase
        .from("schedule_sessions")
        .select("id, session_type, group_id, player_id, start_time, end_time, location, end_date, created_at, groups(id, name, level), private_players:schedule_session_players(profiles!schedule_session_players_player_id_fkey(id, first_name, last_name))")
        .eq("day_of_week", dayOfWeek)
        .eq("is_active", true)
        .order("start_time");

      // Filter out sessions that have ended before the selected date, or were created after it.
      // Private sessions are one-off: only include when end_date matches the selected date.
      const sessionsData = ((scheduleSessions || []) as unknown as ScheduleSession[]).filter(
        (s) => {
          if (s.session_type === "private") {
            return s.end_date === date;
          }
          if (s.end_date && s.end_date < date) return false;
          const createdDate = s.created_at.slice(0, 10);
          if (createdDate > date) return false;
          return true;
        }
      );
      setSessions(sessionsData);

      if (sessionsData.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch group players + existing attendance in parallel (both depend only on step 1)
      const groupIds = [...new Set(
        sessionsData.filter((s) => s.group_id).map((s) => s.group_id as string)
      )];
      const sessionIds = sessionsData.map((s) => s.id);
      const [{ data: allGroupPlayers }, { data: existingAttPrefetch }] = await Promise.all([
        groupIds.length > 0
          ? supabase
              .from("group_players")
              .select("player_id, group_id, profiles!group_players_player_id_fkey(id, first_name, last_name)")
              .in("group_id", groupIds)
              .eq("is_active", true)
          : Promise.resolve({ data: [] as unknown[] }),
        supabase
          .from("attendance")
          .select("player_id, status, schedule_session_id")
          .eq("session_date", date)
          .in("schedule_session_id", sessionIds),
      ]);

      // Build a per-session player list. For group sessions: all active group_players.
      // For private sessions: just the one player attached to the session.
      const playersBySession: Record<string, GroupPlayer[]> = {};
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
      for (const s of sessionsData) {
        if (s.session_type === "private") {
          const rows = (s.private_players || [])
            .map((pp) => pp.profiles)
            .filter((pr): pr is { id: string; first_name: string; last_name: string } => Boolean(pr))
            .map((pr) => ({
              player_id: pr.id,
              profiles: { id: pr.id, first_name: pr.first_name, last_name: pr.last_name },
            }));
          playersBySession[s.id] = rows;
        } else if (s.group_id) {
          playersBySession[s.id] = playersByGroup[s.group_id] || [];
        } else {
          playersBySession[s.id] = [];
        }
      }
      setSessionPlayers(playersBySession);

      // Fetch active/pending subscriptions for all players with package info
      const privatePlayerIds = sessionsData
        .filter((s) => s.session_type === "private")
        .flatMap((s) => (s.private_players || [])
          .map((pp) => pp.profiles?.id)
          .filter((id): id is string => Boolean(id))
        );
      const allPlayerIds = [...new Set([
        ...((allGroupPlayers || []) as { player_id: string }[]).map((gp) => gp.player_id),
        ...privatePlayerIds,
      ])];
      if (allPlayerIds.length > 0) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("id, player_id, sessions_remaining, sessions_total, end_date, status, packages(name)")
          .in("player_id", allPlayerIds)
          .in("status", ["active", "pending"])
          .order("created_at", { ascending: false });

        const sessionsMap: Record<string, PlayerSubscription[]> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (subs || []).forEach((s: any) => {
          // Skip effectively expired subs
          if (s.sessions_remaining <= 0) return;
          if (s.end_date && new Date(s.end_date).getTime() < Date.now()) return;
          const entry: PlayerSubscription = {
            id: s.id,
            remaining: s.sessions_remaining,
            total: s.sessions_total,
            end_date: s.end_date,
            status: s.status,
            package_name: s.packages?.name || "Package",
          };
          if (!sessionsMap[s.player_id]) sessionsMap[s.player_id] = [];
          sessionsMap[s.player_id].push(entry);
        });
        setPlayerSessions(sessionsMap);
      }

      // Existing attendance was prefetched in parallel above
      const existingAtt = existingAttPrefetch;

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

  function markAll(sessionId: string, _groupId: string | null, status: "present" | "absent") {
    const players = sessionPlayers[sessionId] || [];
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
    const players = sessionPlayers[session.id] || [];

    return players.filter((gp) => {
      const status = state[gp.player_id];
      const wasPreviouslyPresent = saved[gp.player_id] === "present";
      // Only flag newly marked present players (not already saved as present)
      if (status !== "present" || wasPreviouslyPresent) return false;
      const subs = playerSessions[gp.player_id] || [];
      const totalRemaining = subs.reduce((sum, s) => sum + s.remaining, 0);
      return subs.length === 0 || totalRemaining <= 0;
    });
  }

  function getMultiSubPresentPlayers(session: ScheduleSession) {
    const state = attendanceState[session.id] || {};
    const saved = savedAttendanceState[session.id] || {};
    const players = sessionPlayers[session.id] || [];

    return players.filter((gp) => {
      const status = state[gp.player_id];
      const wasPreviouslyPresent = saved[gp.player_id] === "present";
      if (status !== "present" || wasPreviouslyPresent) return false;
      const subs = playerSessions[gp.player_id] || [];
      const activeSubs = subs.filter((s) => s.remaining > 0);
      return activeSubs.length > 1;
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

    // Check for players with multiple active subscriptions being marked present
    const multiSubPlayers = getMultiSubPresentPlayers(session);

    // Check for players with no balance being marked present
    const zeroBalancePlayers = getZeroBalancePresentPlayers(session);
    const defaultPkg = packages.find((p) => p.session_count === 1) || packages[0];

    // Pre-select default subscription for multi-sub players
    if (multiSubPlayers.length > 0) {
      const defaults: Record<string, string> = {};
      for (const gp of multiSubPlayers) {
        const subs = playerSessions[gp.player_id] || [];
        const activeSubs = subs.filter((s) => s.remaining > 0);
        if (activeSubs.length >= 1 && !chosenSubs[gp.player_id]) {
          defaults[gp.player_id] = activeSubs[0].id;
        }
      }
      if (Object.keys(defaults).length > 0) {
        setChosenSubs((prev) => ({ ...defaults, ...prev }));
      }
    }

    // Show dialog if there are multi-sub or zero-balance players
    if (multiSubPlayers.length > 0 || (zeroBalancePlayers.length > 0 && defaultPkg)) {
      const playerPackages: Record<string, string> = {};
      if (zeroBalancePlayers.length > 0 && defaultPkg) {
        zeroBalancePlayers.forEach((gp) => { playerPackages[gp.player_id] = defaultPkg.id; });
        setPaymentDialog({ session, players: zeroBalancePlayers, playerPackages });
      }
      if (multiSubPlayers.length > 0) {
        setMultiSubDialog({ session, records, removedPlayerIds, multiSubPlayers });
      } else {
        setMultiSubDialog({ session, records, removedPlayerIds, multiSubPlayers: [] });
      }
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
        const attendanceRecords = records.map((r) => ({
          ...r,
          subscription_id: r.status === "present" ? chosenSubs[r.player_id] || undefined : undefined,
        }));
        const res = await submitAttendance({
          group_id: session.group_id,
          schedule_session_id: session.id,
          session_date: date,
          records: attendanceRecords,
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
              if (r.sessions_remaining !== null) {
                const playerSubs = updated[r.player_id];
                if (playerSubs) {
                  // Find the specific subscription that was deducted
                  const chosenSubId = chosenSubs[r.player_id];
                  if (chosenSubId) {
                    updated[r.player_id] = playerSubs.map((s) =>
                      s.id === chosenSubId ? { ...s, remaining: r.sessions_remaining! } : s
                    );
                  } else if (playerSubs.length === 1) {
                    updated[r.player_id] = [{ ...playerSubs[0], remaining: r.sessions_remaining! }];
                  }
                }
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
          .select("id, player_id, sessions_remaining, sessions_total, end_date, status, packages(name)")
          .in("player_id", removedPlayerIds)
          .in("status", ["active", "pending"])
          .order("created_at", { ascending: false });

        if (updatedSubs) {
          setPlayerSessions((prev) => {
            const updated = { ...prev };
            for (const pid of removedPlayerIds) {
              delete updated[pid];
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const s of updatedSubs as any[]) {
              if (s.sessions_remaining <= 0) continue;
              if (s.end_date && new Date(s.end_date).getTime() < Date.now()) continue;
              const entry: PlayerSubscription = {
                id: s.id,
                remaining: s.sessions_remaining,
                total: s.sessions_total,
                end_date: s.end_date,
                status: s.status,
                package_name: s.packages?.name || "Package",
              };
              if (!updated[s.player_id]) updated[s.player_id] = [];
              updated[s.player_id].push(entry);
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
      setMultiSubDialog(null);
      setPaymentDialog(null);

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
        const players = sessionPlayers[session.id] || [];
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
                        {session.session_type === "private"
                          ? (() => {
                              const names = (session.private_players || [])
                                .map((pp) => pp.profiles)
                                .filter((p): p is { id: string; first_name: string; last_name: string } => Boolean(p));
                              if (names.length === 0) return "Private";
                              if (names.length === 1) return `${names[0].first_name} ${names[0].last_name}`;
                              return `${names[0].first_name} ${names[0].last_name} +${names.length - 1}`;
                            })()
                          : session.groups?.name}
                      </h3>
                      <Badge variant={session.session_type === "private" ? "info" : "neutral"}>
                        {session.session_type === "private" ? "private" : session.groups?.level}
                      </Badge>
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
                    const subs = playerSessions[gp.player_id] || [];
                    const totalRemaining = subs.reduce((sum, s) => sum + s.remaining, 0);
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
                          {subs.length > 1 ? (
                            <p className="text-[11px] text-slate-400">
                              {subs.map((s) => {
                                const exp = s.end_date ? new Date(s.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
                                return `${s.package_name}: ${s.remaining}${exp ? ` (${exp})` : ""}`;
                              }).join(" · ")}
                            </p>
                          ) : subs.length === 1 ? (
                            <p className={cn(
                              "text-[11px]",
                              totalRemaining <= 2 || (subs[0].end_date && Math.ceil((new Date(subs[0].end_date).getTime() - Date.now()) / 86400000) <= 3)
                                ? "text-red-500 font-medium"
                                : "text-slate-400"
                            )}>
                              {subs[0].package_name}: {subs[0].remaining}/{subs[0].total} sessions left
                              {subs[0].end_date && ` · Expires ${new Date(subs[0].end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
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

      {/* Multi-sub + zero-balance drawer */}
      <Drawer
        open={!!multiSubDialog}
        onClose={() => { setMultiSubDialog(null); setPaymentDialog(null); }}
        title="Confirm Attendance"
        footer={
          multiSubDialog ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => { setMultiSubDialog(null); setPaymentDialog(null); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={isPending}
                onClick={() => {
                  const dialog = multiSubDialog;
                  executeSave(dialog.session, dialog.records, dialog.removedPlayerIds, paymentDialog?.playerPackages || {});
                }}
              >
                {isPending ? "Saving..." : paymentDialog ? "Save & Create Payments" : "Save"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {multiSubDialog && (
          <div className="space-y-4">
            {/* Multi-subscription selector */}
            {multiSubDialog.multiSubPlayers.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-700">
                  Choose which package to deduct from:
                </p>
                <div className="space-y-2">
                  {multiSubDialog.multiSubPlayers.map((gp) => {
                    const subs = (playerSessions[gp.player_id] || []).filter((s) => s.remaining > 0);
                    return (
                      <div key={gp.player_id} className="bg-blue-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">
                            {gp.profiles.first_name[0]}{gp.profiles.last_name[0]}
                          </div>
                          <span className="text-xs font-medium text-slate-700">
                            {gp.profiles.first_name} {gp.profiles.last_name}
                          </span>
                        </div>
                        <select
                          value={chosenSubs[gp.player_id] || subs[0]?.id || ""}
                          onChange={(e) => setChosenSubs((prev) => ({ ...prev, [gp.player_id]: e.target.value }))}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                          {subs.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.package_name} — {sub.remaining} sessions left
                              {sub.end_date && ` · Exp ${new Date(sub.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Zero-balance players */}
            {paymentDialog && paymentDialog.players.length > 0 && (() => {
              const total = paymentDialog.players.reduce((sum, gp) => {
                const pkg = packages.find((p) => p.id === paymentDialog.playerPackages[gp.player_id]);
                return sum + (pkg?.price ?? 0);
              }, 0);
              return (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-700">
                    Players with no remaining sessions — a pending payment will be created:
                  </p>
                  <div className="space-y-2">
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
          </div>
        )}
      </Drawer>
    </div>
  );
}
