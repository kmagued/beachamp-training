"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Toast, Select } from "@/components/ui";
import { Loader2, Check, X, AlertTriangle, Users, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { submitCoachAttendance } from "@/app/_actions/training";

type CoachStatus = "present" | "absent" | "excused";

interface SessionRow {
  id: string;
  session_type: string | null;
  group_id: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  end_date: string | null;
  created_at: string;
  coach_id: string | null;
  groups: { name: string; level: string | null } | null;
}

interface CoachProfile {
  id: string;
  first_name: string;
  last_name: string;
}

/** Per session: coach_id -> status (undefined means "not logged") */
type SessionCoachState = Record<string, CoachStatus | undefined>;

const STATUS_BUTTONS: { status: CoachStatus; icon: typeof Check; on: string; off: string; title: string }[] = [
  { status: "present", icon: Check, on: "bg-emerald-500 text-white", off: "bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600", title: "Present" },
  { status: "absent", icon: X, on: "bg-red-500 text-white", off: "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500", title: "Absent" },
  { status: "excused", icon: AlertTriangle, on: "bg-amber-500 text-white", off: "bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600", title: "Excused" },
];

function fmtTime(t: string) {
  const [h, m] = t.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

export function CoachesTab({ date }: { date: string }) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [allCoaches, setAllCoaches] = useState<CoachProfile[]>([]);
  /** Coaches shown on each session card — assigned, group-linked, or already logged */
  const [sessionCoaches, setSessionCoaches] = useState<Record<string, string[]>>({});
  const [state, setState] = useState<Record<string, SessionCoachState>>({});
  const [savedState, setSavedState] = useState<Record<string, SessionCoachState>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [, startTransition] = useTransition();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const dayOfWeek = new Date(date + "T00:00:00").getDay();

      const [{ data: sessionData }, { data: coachData }] = await Promise.all([
        supabase
          .from("schedule_sessions")
          .select("id, session_type, group_id, start_time, end_time, location, end_date, created_at, coach_id, groups(name, level)")
          .eq("day_of_week", dayOfWeek)
          .eq("is_active", true)
          .order("start_time"),
        supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("is_coach", true)
          .order("first_name"),
      ]);

      if (cancelled) return;

      // day_of_week gives the recurring template, not this date. Same filter the
      // Attendance tab applies, so both tabs agree on what ran: private sessions are
      // one-off and must match the date exactly; recurring ones are excluded once they
      // have ended, or if they were created after the date being reported on.
      const sessionRows = ((sessionData || []) as unknown as SessionRow[]).filter((s) => {
        if (s.session_type === "private") return s.end_date === date;
        if (s.end_date && s.end_date < date) return false;
        if (s.created_at.slice(0, 10) > date) return false;
        return true;
      });
      const coaches = (coachData || []) as unknown as CoachProfile[];
      const sessionIds = sessionRows.map((s) => s.id);
      const groupIds = [...new Set(sessionRows.map((s) => s.group_id).filter((g): g is string => Boolean(g)))];

      const [{ data: logged }, { data: groupCoaches }] = await Promise.all([
        sessionIds.length > 0
          ? supabase
              .from("coach_attendance")
              .select("coach_id, status, schedule_session_id")
              .eq("session_date", date)
              .in("schedule_session_id", sessionIds)
          : Promise.resolve({ data: [] as unknown[] }),
        groupIds.length > 0
          ? supabase
              .from("coach_groups")
              .select("coach_id, group_id")
              .in("group_id", groupIds)
              .eq("is_active", true)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      if (cancelled) return;

      const coachesByGroup: Record<string, string[]> = {};
      for (const cg of (groupCoaches || []) as { coach_id: string; group_id: string }[]) {
        (coachesByGroup[cg.group_id] ||= []).push(cg.coach_id);
      }

      const loggedBySession: Record<string, SessionCoachState> = {};
      for (const row of (logged || []) as { coach_id: string; status: CoachStatus; schedule_session_id: string }[]) {
        (loggedBySession[row.schedule_session_id] ||= {})[row.coach_id] = row.status;
      }

      // A card lists the assigned coach, the group's coaches, and anyone already
      // logged — so a substitute saved earlier still shows up on reload.
      const known = new Set(coaches.map((c) => c.id));
      const listed: Record<string, string[]> = {};
      for (const s of sessionRows) {
        const ids = new Set<string>();
        if (s.coach_id) ids.add(s.coach_id);
        for (const id of coachesByGroup[s.group_id ?? ""] || []) ids.add(id);
        for (const id of Object.keys(loggedBySession[s.id] || {})) ids.add(id);
        listed[s.id] = [...ids].filter((id) => known.has(id));
      }

      setSessions(sessionRows);
      setAllCoaches(coaches);
      setSessionCoaches(listed);
      setState(loggedBySession);
      setSavedState(JSON.parse(JSON.stringify(loggedBySession)));
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function setStatus(sessionId: string, coachId: string, status: CoachStatus) {
    setState((prev) => {
      const session = { ...(prev[sessionId] || {}) };
      // Tapping the active status again clears it, matching player attendance
      session[coachId] = session[coachId] === status ? undefined : status;
      return { ...prev, [sessionId]: session };
    });
  }

  function addCoach(sessionId: string, coachId: string) {
    if (!coachId) return;
    setSessionCoaches((prev) => ({
      ...prev,
      [sessionId]: [...new Set([...(prev[sessionId] || []), coachId])],
    }));
  }

  async function save(sessionId: string) {
    const current = state[sessionId] || {};
    const saved = savedState[sessionId] || {};

    const records = Object.entries(current)
      .filter(([, status]) => status !== undefined)
      .map(([coach_id, status]) => ({ coach_id, status: status as CoachStatus }));

    // Anything that had a saved status and no longer does was cleared
    const cleared = Object.keys(saved).filter((id) => saved[id] !== undefined && current[id] === undefined);

    setSavingId(sessionId);
    const res = await submitCoachAttendance({
      schedule_session_id: sessionId,
      session_date: date,
      records,
      cleared_coach_ids: cleared,
    });
    setSavingId(null);

    if (res?.error) {
      setToast({ message: res.error, variant: "error" });
      return;
    }
    setSavedState((prev) => ({ ...prev, [sessionId]: { ...current } }));
    setToast({
      message: records.length > 0 ? `Logged ${records.length} coach${records.length > 1 ? "es" : ""}` : "Coach attendance cleared",
      variant: "success",
    });
    startTransition(() => {});
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Card key={i} className="animate-pulse h-32" />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return <p className="text-center text-sm text-slate-400 py-12">No sessions scheduled on this day</p>;
  }

  return (
    <div className="space-y-4">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      {sessions.map((session) => {
        const listedIds = sessionCoaches[session.id] || [];
        const current = state[session.id] || {};
        const saved = savedState[session.id] || {};
        const loggedCount = Object.values(current).filter((s) => s !== undefined).length;

        const allKeys = new Set([...Object.keys(saved), ...Object.keys(current)]);
        const hasChanges = [...allKeys].some((k) => (saved[k] || undefined) !== (current[k] || undefined));

        const rows = listedIds
          .map((id) => allCoaches.find((c) => c.id === id))
          .filter((c): c is CoachProfile => Boolean(c))
          .sort((a, b) => {
            // Assigned coach leads, then alphabetical. Attendance state is not part of
            // this, so tapping a coach never moves the row.
            const aAssigned = a.id === session.coach_id ? 0 : 1;
            const bAssigned = b.id === session.coach_id ? 0 : 1;
            if (aAssigned !== bAssigned) return aAssigned - bAssigned;
            return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
          });

        const addable = allCoaches.filter((c) => !listedIds.includes(c.id));

        return (
          <Card key={session.id} className="p-0">
            <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-900">
                    {session.groups?.name || (session.session_type === "private" ? "Private session" : "Session")}
                  </h3>
                  {session.groups?.level && <Badge variant="neutral" className="capitalize">{session.groups.level}</Badge>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fmtTime(session.start_time)} – {fmtTime(session.end_time)}
                  {session.location && ` · ${session.location}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {loggedCount > 0 ? `${loggedCount} logged` : "Not logged"}
                </span>
                {hasChanges && (
                  <Button size="sm" onClick={() => save(session.id)} disabled={savingId === session.id}>
                    {savingId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                )}
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                No coach assigned to this session — add one below
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {rows.map((coach) => {
                  const status = current[coach.id];
                  return (
                    <div key={coach.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-800 grid place-items-center text-[11px] font-bold shrink-0">
                          {coach.first_name[0]}{coach.last_name[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {coach.first_name} {coach.last_name}
                          </p>
                          {coach.id === session.coach_id && (
                            <p className="text-[11px] text-slate-400">Assigned coach</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {STATUS_BUTTONS.map(({ status: s, icon: Icon, on, off, title }) => (
                          <button
                            key={s}
                            type="button"
                            title={title}
                            aria-label={title}
                            aria-pressed={status === s}
                            onClick={() => setStatus(session.id, coach.id, s)}
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                              status === s ? on : off
                            )}
                          >
                            <Icon className="w-4 h-4" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {addable.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-slate-400 shrink-0" />
                <Select
                  size="sm"
                  aria-label="Add a coach to this session"
                  value=""
                  onChange={(e) => addCoach(session.id, e.target.value as string)}
                  className="w-auto min-w-48 border-slate-200"
                >
                  <option value="">Add a coach…</option>
                  {addable.map((c) => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </Select>
                <span className="text-[11px] text-slate-400 hidden sm:inline">for substitutes or a second coach</span>
              </div>
            )}
          </Card>
        );
      })}

      <p className="text-xs text-slate-400 flex items-center gap-1.5 pt-1">
        <Users className="w-3.5 h-3.5" />
        A coach left unmarked is not recorded at all — mark them absent to record a no-show.
      </p>
    </div>
  );
}
