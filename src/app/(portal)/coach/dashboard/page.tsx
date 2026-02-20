import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import Link from "next/link";
import { StatCard, Card, Badge } from "@/components/ui";
import { CalendarDays, Users, MessageSquare, UsersRound, Clock, ClipboardCheck, Star, ChevronRight } from "lucide-react";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function getLevelVariant(level: string): "success" | "warning" | "danger" | "info" {
  switch (level) {
    case "beginner": return "success";
    case "intermediate": return "warning";
    case "advanced": return "danger";
    default: return "info";
  }
}

export default async function CoachDashboard() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const userId = currentUser.id;
  const todayDow = new Date().getDay();

  // Parallel queries
  const [
    { data: todaySessions },
    { count: totalGroups },
    { data: recentAttendance },
    { data: recentFeedback },
  ] = await Promise.all([
    // Today's sessions for this coach
    supabase
      .from("schedule_sessions")
      .select("id, group_id, start_time, end_time, location, day_of_week, groups(id, name, level)")
      .eq("coach_id", userId)
      .eq("day_of_week", todayDow)
      .eq("is_active", true)
      .order("start_time"),
    // Total groups assigned
    supabase
      .from("coach_groups")
      .select("*", { count: "exact", head: true })
      .eq("coach_id", userId)
      .eq("is_active", true),
    // Recent attendance logged by this coach
    supabase
      .from("attendance")
      .select("id, session_date, group_id, status, groups(name)")
      .eq("marked_by", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    // Recent feedback by this coach
    supabase
      .from("feedback")
      .select("id, session_date, rating, comment, player_id, profiles!feedback_player_id_fkey(first_name, last_name)")
      .eq("coach_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Compute stats
  const todaySessionCount = todaySessions?.length || 0;

  // Get player counts for today's groups
  let todayPlayerCount = 0;
  if (todaySessions && todaySessions.length > 0) {
    const groupIds = todaySessions.map((s: { group_id: string }) => s.group_id);
    const { count } = await supabase
      .from("group_players")
      .select("*", { count: "exact", head: true })
      .in("group_id", groupIds)
      .eq("is_active", true);
    todayPlayerCount = count || 0;
  }

  // Aggregate recent attendance into session summaries
  const attendanceSummary = new Map<string, { date: string; group: string; present: number; absent: number; excused: number }>();
  if (recentAttendance) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of recentAttendance as any[]) {
      const key = `${a.session_date}_${a.group_id}`;
      const existing = attendanceSummary.get(key) || { date: a.session_date, group: a.groups?.name || "Unknown", present: 0, absent: 0, excused: 0 };
      if (a.status === "present") existing.present++;
      else if (a.status === "absent") existing.absent++;
      else if (a.status === "excused") existing.excused++;
      attendanceSummary.set(key, existing);
    }
  }
  const recentSessions = Array.from(attendanceSummary.values()).slice(0, 5);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          Coach Dashboard
        </h1>
        <p className="text-slate-500 text-sm">
          Welcome back, {currentUser.profile.first_name}. Here&apos;s your day.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Today's Sessions"
          value={todaySessionCount}
          accentColor="bg-brand-coach"
          icon={<CalendarDays className="w-5 h-5" />}
        />
        <StatCard
          label="Players Today"
          value={todayPlayerCount}
          accentColor="bg-primary"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Total Groups"
          value={totalGroups ?? 0}
          accentColor="bg-emerald-500"
          icon={<UsersRound className="w-5 h-5" />}
        />
        <StatCard
          label="Feedback Given"
          value={recentFeedback?.length || 0}
          subtitle="Last 30 days"
          accentColor="bg-amber-500"
          icon={<MessageSquare className="w-5 h-5" />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Today's Sessions */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-400" />
              Today&apos;s Sessions
            </h2>
            <Link
              href="/coach/schedule"
              className="text-xs font-medium text-primary hover:underline"
            >
              View Schedule
            </Link>
          </div>

          {todaySessions && todaySessions.length > 0 ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {todaySessions.map((session: any) => (
                <Link
                  key={session.id}
                  href={`/coach/sessions/${session.id}?date=${new Date().toISOString().split("T")[0]}`}
                  className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 -mx-2 px-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">
                        {session.groups?.name}
                      </p>
                      <Badge variant={getLevelVariant(session.groups?.level || "mixed")}>
                        {session.groups?.level}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatTime(session.start_time)} — {formatTime(session.end_time)}
                      {session.location && (
                        <>
                          <span>&middot;</span>
                          <span>{session.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">
              No sessions scheduled for today. Enjoy your day off!
            </p>
          )}
        </Card>

        {/* Recent Activity */}
        <div className="space-y-4 sm:space-y-6">
          {/* Recent Attendance */}
          <Card>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <ClipboardCheck className="w-4 h-4 text-slate-400" />
              Recent Attendance
            </h2>
            {recentSessions.length > 0 ? (
              <div className="space-y-2">
                {recentSessions.map((session, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                    <div>
                      <span className="font-medium text-slate-900">{session.group}</span>
                      <span className="text-xs text-slate-400 ml-2">{session.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-600">{session.present}P</span>
                      <span className="text-red-500">{session.absent}A</span>
                      <span className="text-amber-500">{session.excused}E</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No attendance logged yet</p>
            )}
          </Card>

          {/* Recent Feedback */}
          <Card>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              Recent Feedback
            </h2>
            {recentFeedback && recentFeedback.length > 0 ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {recentFeedback.map((fb: any) => (
                  <div key={fb.id} className="flex items-center justify-between py-1.5 text-sm">
                    <div>
                      <span className="font-medium text-slate-900">
                        {fb.profiles?.first_name} {fb.profiles?.last_name}
                      </span>
                      <span className="text-xs text-slate-400 ml-2">{fb.session_date}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3 h-3 ${s <= fb.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No feedback submitted yet</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
