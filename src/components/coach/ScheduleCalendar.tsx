"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Skeleton } from "@/components/ui";
import { ChevronLeft, ChevronRight, Clock, ClipboardCheck } from "lucide-react";
import Link from "next/link";

// Saturday-first week for Egypt locale
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Sat, Sun, Mon, Tue, Wed, Thu, Fri
const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface ScheduleBlock {
  id: string;
  group_id: string;
  group_name: string;
  group_level: string;
  coach_id: string | null;
  coach_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  player_count: number;
  has_attendance: boolean; // for the current week
}

interface ScheduleCalendarProps {
  coachId: string;
  isAdmin: boolean;
  sessionBasePath: string; // "/coach/sessions" or "/admin/sessions"
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function getLevelColor(level: string) {
  switch (level) {
    case "beginner": return "border-l-emerald-500 bg-emerald-50";
    case "intermediate": return "border-l-amber-500 bg-amber-50";
    case "advanced": return "border-l-red-500 bg-red-50";
    default: return "border-l-blue-500 bg-blue-50";
  }
}

/** Format a Date as YYYY-MM-DD using local timezone (avoids UTC shift from toISOString) */
function formatLocalDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Get the Saturday that starts the current week (Egypt locale: Sat-Fri) */
function getCurrentWeekSaturday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentDay = today.getDay();
  const saturdayOffset = currentDay >= 6 ? 0 : -(currentDay + 1);
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + saturdayOffset);
  return saturday;
}

/** Get 7 dates starting from a given Saturday */
function getWeekDatesFromSaturday(saturday: Date) {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

export function ScheduleCalendar({ coachId, isAdmin, sessionBasePath }: ScheduleCalendarProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [sessions, setSessions] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(isAdmin);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const currentSaturday = useMemo(() => getCurrentWeekSaturday(), []);
  const currentSaturdayStr = formatLocalDate(currentSaturday);

  const selectedSaturday = useMemo(() => {
    const weekParam = searchParams.get("week");
    if (weekParam) {
      const [y, m, d] = weekParam.split("-").map(Number);
      const parsed = new Date(y, m - 1, d);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return currentSaturday;
  }, [searchParams, currentSaturday]);

  const weekDates = useMemo(() => getWeekDatesFromSaturday(selectedSaturday), [selectedSaturday]);
  const isThisWeek = formatLocalDate(selectedSaturday) === currentSaturdayStr;

  const navigateWeek = useCallback((direction: number) => {
    const newSaturday = new Date(selectedSaturday);
    newSaturday.setDate(newSaturday.getDate() + direction * 7);
    const params = new URLSearchParams(searchParams.toString());
    if (formatLocalDate(newSaturday) === currentSaturdayStr) {
      params.delete("week");
    } else {
      params.set("week", formatLocalDate(newSaturday));
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [selectedSaturday, searchParams, currentSaturdayStr, router, pathname]);

  const goToThisWeek = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("week");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [searchParams, router, pathname]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    async function load() {
      setLoading(true);

      let query = supabase
        .from("schedule_sessions")
        .select("id, group_id, coach_id, day_of_week, start_time, end_time, location, groups(id, name, level), profiles!schedule_sessions_coach_id_fkey(first_name, last_name)")
        .eq("is_active", true);

      if (!showAll) {
        // Get groups assigned to this coach
        const { data: coachGroups } = await supabase
          .from("coach_groups")
          .select("group_id")
          .eq("coach_id", coachId)
          .eq("is_active", true);

        const groupIds = (coachGroups || []).map((cg: { group_id: string }) => cg.group_id);
        if (groupIds.length === 0) {
          setSessions([]);
          setLoading(false);
          return;
        }
        query = query.in("group_id", groupIds);
      }

      const { data } = await query.order("start_time");

      if (!data) {
        setLoading(false);
        return;
      }

      // Get player counts per group
      const groupIds = [...new Set(data.map((s: { group_id: string }) => s.group_id))];
      const playerCounts = new Map<string, number>();

      for (const gid of groupIds) {
        const { count } = await supabase
          .from("group_players")
          .select("*", { count: "exact", head: true })
          .eq("group_id", gid)
          .eq("is_active", true);
        playerCounts.set(gid, count || 0);
      }

      // Check attendance for this week
      const weekStart = formatLocalDate(weekDates[0]);
      const weekEnd = formatLocalDate(weekDates[6]);

      const { data: attendanceRecords } = await supabase
        .from("attendance")
        .select("schedule_session_id, session_date")
        .gte("session_date", weekStart)
        .lte("session_date", weekEnd);

      const attendanceSet = new Set<string>();
      if (attendanceRecords) {
        for (const a of attendanceRecords) {
          if (a.schedule_session_id) {
            attendanceSet.add(`${a.schedule_session_id}_${a.session_date}`);
          }
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blocks: ScheduleBlock[] = data.map((s: any) => {
        // Find the date for this session in the current week
        const dayDate = weekDates.find((d) => d.getDay() === s.day_of_week);
        const dateStr = dayDate ? formatLocalDate(dayDate) : "";

        return {
          id: s.id,
          group_id: s.group_id,
          group_name: s.groups?.name || "Unknown",
          group_level: s.groups?.level || "mixed",
          coach_id: s.coach_id,
          coach_name: s.profiles ? `${s.profiles.first_name} ${s.profiles.last_name}` : null,
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          location: s.location,
          player_count: playerCounts.get(s.group_id) || 0,
          has_attendance: attendanceSet.has(`${s.id}_${dateStr}`),
        };
      });

      setSessions(blocks);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, showAll, selectedSaturday]);

  // Group sessions by day
  const sessionsByDay = new Map<number, ScheduleBlock[]>();
  for (const s of sessions) {
    const existing = sessionsByDay.get(s.day_of_week) || [];
    existing.push(s);
    sessionsByDay.set(s.day_of_week, existing);
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToThisWeek}
            className={`text-sm font-medium px-2 ${isThisWeek ? "text-slate-400 cursor-default" : "text-primary hover:underline"}`}
            disabled={isThisWeek}
          >
            This Week
          </button>
          <button
            onClick={() => navigateWeek(1)}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 ml-1">
            {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} —{" "}
            {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAll(!showAll)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              showAll
                ? "bg-primary-50 border-primary text-primary"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            {showAll ? "All Sessions" : "My Sessions"}
          </button>
        )}
      </div>

      {/* Weekly Grid — Desktop */}
      {loading ? (
        <>
          <div className="hidden sm:grid grid-cols-7 gap-2">
            {DAY_ORDER.map((day) => (
              <div key={day}>
                <Skeleton className="h-6 w-full mb-2 rounded" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <div className="sm:hidden space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Desktop: 7-column grid */}
          <div className="hidden sm:grid grid-cols-7 gap-2">
            {DAY_ORDER.map((dayNum, idx) => {
              const dateForDay = weekDates[idx];
              const isToday =
                dateForDay.getDate() === today.getDate() &&
                dateForDay.getMonth() === today.getMonth() &&
                dateForDay.getFullYear() === today.getFullYear();
              const daySessions = sessionsByDay.get(dayNum) || [];

              return (
                <div key={dayNum} className="min-h-[120px]">
                  <div
                    className={`text-center py-1.5 rounded-lg mb-2 ${
                      isToday
                        ? "bg-primary text-white"
                        : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase">{DAY_NAMES_SHORT[dayNum]}</p>
                    <p className={`text-sm font-bold ${isToday ? "text-white" : "text-slate-900"}`}>
                      {dateForDay.getDate()}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {daySessions.length === 0 ? (
                      <div className="text-center py-4 text-[10px] text-slate-300">—</div>
                    ) : (
                      daySessions.map((session) => {
                        const sessionDate = formatLocalDate(dateForDay);
                        return (
                          <Link
                            key={session.id}
                            href={`${sessionBasePath}/${session.id}?date=${sessionDate}`}
                            className={`block w-full text-left p-2 rounded-lg border-l-3 ${getLevelColor(session.group_level)} ${
                              session.has_attendance ? "opacity-60" : ""
                            } hover:shadow-sm transition-shadow`}
                          >
                            <p className="text-[11px] font-semibold text-slate-900 truncate">
                              {session.group_name}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {formatTime(session.start_time)}
                            </p>
                            {session.has_attendance && (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                <ClipboardCheck className="w-2.5 h-2.5 text-emerald-500" />
                                <span className="text-[9px] text-emerald-600">Logged</span>
                              </div>
                            )}
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: vertical day list */}
          <div className="sm:hidden space-y-2">
            {DAY_ORDER.map((dayNum, idx) => {
              const dateForDay = weekDates[idx];
              const isToday =
                dateForDay.getDate() === today.getDate() &&
                dateForDay.getMonth() === today.getMonth() &&
                dateForDay.getFullYear() === today.getFullYear();
              const daySessions = sessionsByDay.get(dayNum) || [];

              return (
                <div
                  key={dayNum}
                  className={`rounded-lg border ${isToday ? "border-primary bg-primary-50/30" : "border-slate-100 bg-white"}`}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <div
                      className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 ${
                        isToday ? "bg-primary text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <span className="text-[9px] font-semibold uppercase leading-none">{DAY_NAMES_SHORT[dayNum]}</span>
                      <span className={`text-sm font-bold leading-tight ${isToday ? "text-white" : "text-slate-900"}`}>
                        {dateForDay.getDate()}
                      </span>
                    </div>

                    {daySessions.length === 0 ? (
                      <span className="text-xs text-slate-300">No sessions</span>
                    ) : (
                      <div className="flex-1 space-y-1.5">
                        {daySessions.map((session) => {
                          const sessionDate = formatLocalDate(dateForDay);
                          return (
                            <Link
                              key={session.id}
                              href={`${sessionBasePath}/${session.id}?date=${sessionDate}`}
                              className={`block w-full text-left p-2 rounded-lg border-l-3 ${getLevelColor(session.group_level)} ${
                                session.has_attendance ? "opacity-60" : ""
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-900">{session.group_name}</span>
                                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(session.start_time)}
                                </span>
                              </div>
                              {session.has_attendance && (
                                <div className="flex items-center gap-0.5 mt-0.5">
                                  <ClipboardCheck className="w-2.5 h-2.5 text-emerald-500" />
                                  <span className="text-[9px] text-emerald-600">Logged</span>
                                </div>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}
