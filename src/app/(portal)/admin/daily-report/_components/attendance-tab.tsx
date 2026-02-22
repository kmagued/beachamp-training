"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button } from "@/components/ui";
import { Loader2, Check, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { submitAttendance } from "@/app/_actions/training";

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
  [playerId: string]: "present" | "absent" | "excused";
}

export function AttendanceTab({ date }: { date: string }) {
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionPlayers, setSessionPlayers] = useState<Record<string, GroupPlayer[]>>({});
  const [existingAttendance, setExistingAttendance] = useState<Record<string, AttendanceRecord[]>>({});
  const [attendanceState, setAttendanceState] = useState<Record<string, SessionAttendanceState>>({});
  const [savedSessions, setSavedSessions] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [savingSessionId, setSavingSessionId] = useState<string | null>(null);

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
      setExistingAttendance(attBySession);

      // Initialize attendance state
      const initialState: Record<string, SessionAttendanceState> = {};
      sessionsData.forEach((session) => {
        const sessionState: SessionAttendanceState = {};
        const players = playersByGroup[session.group_id] || [];
        const existing = attBySession[session.id] || [];

        players.forEach((p) => {
          const existingRecord = existing.find((a) => a.player_id === p.player_id);
          sessionState[p.player_id] = existingRecord?.status || "absent";
        });

        initialState[session.id] = sessionState;

        // Mark sessions that already have attendance as saved
        if (existing.length > 0) {
          setSavedSessions((prev) => new Set([...prev, session.id]));
        }
      });
      setAttendanceState(initialState);
      setLoading(false);
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function toggleStatus(sessionId: string, playerId: string) {
    setAttendanceState((prev) => {
      const current = prev[sessionId]?.[playerId] || "absent";
      const next = current === "present" ? "absent" : current === "absent" ? "excused" : "present";
      return {
        ...prev,
        [sessionId]: { ...prev[sessionId], [playerId]: next },
      };
    });
    // Remove from saved when modified
    setSavedSessions((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }

  function markAllPresent(sessionId: string, groupId: string) {
    const players = sessionPlayers[groupId] || [];
    setAttendanceState((prev) => {
      const sessionState: SessionAttendanceState = {};
      players.forEach((p) => { sessionState[p.player_id] = "present"; });
      return { ...prev, [sessionId]: sessionState };
    });
    setSavedSessions((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }

  function handleSaveSession(session: ScheduleSession) {
    const state = attendanceState[session.id] || {};
    const records = Object.entries(state).map(([player_id, status]) => ({
      player_id,
      status,
    }));

    if (records.length === 0) return;

    setSavingSessionId(session.id);
    startTransition(async () => {
      const res = await submitAttendance({
        group_id: session.group_id,
        schedule_session_id: session.id,
        session_date: date,
        records,
      });
      setSavingSessionId(null);
      if ("success" in res && res.success) {
        setSavedSessions((prev) => new Set([...prev, session.id]));
      }
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
      {sessions.map((session) => {
        const players = sessionPlayers[session.group_id] || [];
        const state = attendanceState[session.id] || {};
        const presentCount = Object.values(state).filter((s) => s === "present").length;
        const isSaved = savedSessions.has(session.id);
        const isSaving = savingSessionId === session.id;

        return (
          <Card key={session.id} className="p-0">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {presentCount}/{players.length} present
                </span>
                {isSaved ? (
                  <Badge variant="success">
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3" /> Saved
                    </span>
                  </Badge>
                ) : (
                  <Button
                    onClick={() => handleSaveSession(session)}
                    disabled={isPending || players.length === 0}
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                      </span>
                    ) : (
                      "Save"
                    )}
                  </Button>
                )}
              </div>
            </div>

            {players.length === 0 ? (
              <div className="px-5 py-6 text-center">
                <Users className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No players in this group</p>
              </div>
            ) : (
              <>
                <div className="px-5 py-2 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Players</span>
                  <button
                    onClick={() => markAllPresent(session.id, session.group_id)}
                    className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Mark All Present
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {players.map((gp) => {
                    const status = state[gp.player_id] || "absent";
                    return (
                      <div
                        key={gp.player_id}
                        className="flex items-center justify-between px-5 py-3"
                      >
                        <span className="text-sm text-slate-700">
                          {gp.profiles.first_name} {gp.profiles.last_name}
                        </span>
                        <button
                          onClick={() => toggleStatus(session.id, gp.player_id)}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                            status === "present" && "bg-emerald-100 text-emerald-700",
                            status === "absent" && "bg-red-100 text-red-600",
                            status === "excused" && "bg-amber-100 text-amber-700"
                          )}
                        >
                          {status === "present" ? "Present" : status === "absent" ? "Absent" : "Excused"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
