"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Badge, Card, Skeleton } from "@/components/ui";
import { ArrowLeft, Clock, MapPin, Users, Calendar, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils/format-date";
import { AttendanceTab } from "./AttendanceTab";

interface PrivatePlayer {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface SessionInfo {
  id: string;
  session_type: "group" | "private";
  group_id: string | null;
  group_name: string;
  group_level: string;
  private_players: PrivatePlayer[];
  coach_id: string | null;
  coach_name: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  player_count: number;
}

interface SessionDetailProps {
  scheduleSessionId: string;
  basePath: string; // "/admin" or "/coach"
}

const TABS = [
  { key: "attendance", label: "Attendance", icon: ClipboardCheck },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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
    case "private": return "info";
    default: return "info";
  }
}

export function SessionDetail({ scheduleSessionId, basePath }: SessionDetailProps) {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") || new Date().toISOString().split("T")[0];

  // Compute the Saturday that starts the week containing dateParam
  const scheduleWeekParam = (() => {
    const d = new Date(dateParam + "T00:00:00");
    const day = d.getDay();
    const satOffset = day >= 6 ? 0 : -(day + 1);
    const sat = new Date(d);
    sat.setDate(d.getDate() + satOffset);
    return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, "0")}-${String(sat.getDate()).padStart(2, "0")}`;
  })();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("attendance");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("schedule_sessions")
        .select("id, session_type, group_id, player_id, coach_id, day_of_week, start_time, end_time, location, groups(id, name, level), private_players:schedule_session_players(profiles!schedule_session_players_player_id_fkey(id, first_name, last_name, avatar_url)), profiles!schedule_sessions_coach_id_fkey(first_name, last_name)")
        .eq("id", scheduleSessionId)
        .single();

      if (!data) {
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const isPrivate = d.session_type === "private";
      const privatePlayers: PrivatePlayer[] = isPrivate
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (d.private_players || [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((pp: any) => pp.profiles)
            .filter(Boolean)
        : [];

      let count = 0;
      if (!isPrivate && d.group_id) {
        const { count: c } = await supabase
          .from("group_players")
          .select("*", { count: "exact", head: true })
          .eq("group_id", d.group_id)
          .eq("is_active", true);
        count = c || 0;
      } else if (isPrivate) {
        count = privatePlayers.length;
      }

      const privateDisplay = privatePlayers.length === 0
        ? "Private Session"
        : privatePlayers.length === 1
          ? `${privatePlayers[0].first_name} ${privatePlayers[0].last_name}`
          : `${privatePlayers.length} Players`;

      setSession({
        id: d.id,
        session_type: (d.session_type || "group") as "group" | "private",
        group_id: d.group_id,
        group_name: isPrivate ? privateDisplay : (d.groups?.name || "Unknown"),
        group_level: isPrivate ? "private" : (d.groups?.level || "mixed"),
        private_players: privatePlayers,
        coach_id: d.coach_id,
        coach_name: d.profiles ? `${d.profiles.first_name} ${d.profiles.last_name}` : null,
        day_of_week: d.day_of_week,
        start_time: d.start_time,
        end_time: d.end_time,
        location: d.location,
        player_count: count,
      });
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSessionId]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-48 mb-1" />
        <Skeleton className="h-4 w-64 mb-6" />
        <Skeleton className="h-10 w-full mb-4 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto text-center py-12">
        <p className="text-slate-500">Session not found</p>
        <Link href={`${basePath}/schedule`} className="text-primary hover:underline text-sm mt-2 inline-block">
          Back to Schedule
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href={`${basePath}/schedule?week=${scheduleWeekParam}`} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Schedule
        </Link>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{session.group_name}</h1>
          <Badge variant={getLevelVariant(session.group_level)}>{session.group_level}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4 text-slate-400" />
            {formatDate(dateParam)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-slate-400" />
            {formatTime(session.start_time)} — {formatTime(session.end_time)}
          </span>
          {session.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4 text-slate-400" />
              {session.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4 text-slate-400" />
            {session.player_count} players
          </span>
          {session.coach_name && (
            <span className="text-slate-400">Coach: {session.coach_name}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <Card>
        {activeTab === "attendance" && (
          <AttendanceTab
            scheduleSessionId={session.id}
            groupId={session.group_id}
            groupName={session.group_name}
            sessionDate={dateParam}
            startTime={session.start_time}
            endTime={session.end_time}
            privatePlayers={session.session_type === "private" ? session.private_players : null}
          />
        )}
      </Card>
    </div>
  );
}
