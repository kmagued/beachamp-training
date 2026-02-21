"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Badge, Card, Skeleton } from "@/components/ui";
import { ArrowLeft, Users, Calendar } from "lucide-react";
import Link from "next/link";
import { getLevelVariant } from "@/app/(portal)/admin/groups/_components/types";
import { ScheduleSection } from "@/app/(portal)/admin/groups/[id]/_components/schedule-section";
import type { GroupInfo, GroupPlayerRow, CoachRow, ScheduleRow } from "@/app/(portal)/admin/groups/[id]/_components/types";

const TABS = [
  { key: "players", label: "Players", icon: Users },
  { key: "schedule", label: "Schedule", icon: Calendar },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function CoachGroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("players");

  const [players, setPlayers] = useState<GroupPlayerRow[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchGroup = useCallback(async () => {
    const { data } = await supabase.from("groups").select("*").eq("id", groupId).single();
    if (data) setGroup(data);
  }, [groupId, supabase]);

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from("group_players")
      .select("player_id, joined_at, profiles!group_players_player_id_fkey(id, first_name, last_name, playing_level)")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("joined_at", { ascending: false });

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const playerIds = data.map((gp: any) => gp.profiles?.id).filter(Boolean);
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("player_id, sessions_remaining")
        .in("player_id", playerIds.length > 0 ? playerIds : ["__none__"])
        .eq("status", "active");

      const subMap = new Map((subs || []).map((s: { player_id: string; sessions_remaining: number }) => [s.player_id, s.sessions_remaining]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPlayers(data.map((gp: any) => ({
        id: gp.profiles?.id || "",
        first_name: gp.profiles?.first_name || "",
        last_name: gp.profiles?.last_name || "",
        playing_level: gp.profiles?.playing_level,
        sessions_remaining: subMap.get(gp.profiles?.id) ?? null,
        joined_at: gp.joined_at,
      })));
    }
  }, [groupId, supabase]);

  const fetchCoaches = useCallback(async () => {
    const { data } = await supabase
      .from("coach_groups")
      .select("coach_id, is_primary, assigned_at, profiles!coach_groups_coach_id_fkey(first_name, last_name, email)")
      .eq("group_id", groupId)
      .eq("is_active", true);

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCoaches(data.map((cg: any) => ({
        id: cg.coach_id,
        first_name: cg.profiles?.first_name || "",
        last_name: cg.profiles?.last_name || "",
        email: cg.profiles?.email,
        is_primary: cg.is_primary,
        assigned_at: cg.assigned_at,
      })));
    }
  }, [groupId, supabase]);

  const fetchSchedule = useCallback(async () => {
    const { data } = await supabase
      .from("schedule_sessions")
      .select("id, day_of_week, start_time, end_time, location, coach_id, profiles!schedule_sessions_coach_id_fkey(first_name, last_name)")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("day_of_week")
      .order("start_time");

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSchedule(data.map((s: any) => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        location: s.location,
        coach_id: s.coach_id,
        coach_name: s.profiles ? `${s.profiles.first_name} ${s.profiles.last_name}` : null,
      })));
    }
  }, [groupId, supabase]);

  useEffect(() => {
    async function init() {
      await fetchGroup();
      await Promise.all([fetchPlayers(), fetchCoaches(), fetchSchedule()]);
      setLoading(false);
    }
    init();
  }, [fetchGroup, fetchPlayers, fetchCoaches, fetchSchedule]);

  const tabCounts: Record<TabKey, number> = {
    players: players.length,
    schedule: schedule.length,
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-48 mb-1" />
        <Skeleton className="h-4 w-32 mb-6" />
        <Skeleton className="h-10 w-full mb-4 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto text-center py-12">
        <p className="text-slate-500">Group not found</p>
        <Link href="/coach/groups" className="text-primary hover:underline text-sm mt-2 inline-block">
          Back to My Groups
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/coach/groups" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to My Groups
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{group.name}</h1>
          <Badge variant={getLevelVariant(group.level)}>{group.level}</Badge>
        </div>
        {group.description && <p className="text-slate-500 text-sm mt-1">{group.description}</p>}
        <p className="text-xs text-slate-400 mt-1">{players.length} / {group.max_players} players</p>
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
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? "bg-primary-50 text-primary" : "bg-slate-100 text-slate-500"
              }`}>
                {tabCounts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "players" && (
        <Card>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-slate-400" />
            Players
            <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{players.length}</span>
          </h2>

          {players.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No players in this group yet</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Name</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Level</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Sessions Left</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {players.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 font-medium text-slate-900">{p.first_name} {p.last_name}</td>
                        <td className="py-2.5 capitalize text-slate-600">{p.playing_level || "—"}</td>
                        <td className="py-2.5">
                          {p.sessions_remaining !== null ? (
                            <span className={p.sessions_remaining <= 2 ? "text-amber-600 font-medium" : "text-slate-600"}>
                              {p.sessions_remaining}
                            </span>
                          ) : (
                            <span className="text-slate-400">No sub</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {players.map((p) => (
                  <div key={p.id} className="border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{p.first_name} {p.last_name}</p>
                        {p.playing_level && (
                          <Badge variant={
                            p.playing_level === "advanced" ? "danger" :
                            p.playing_level === "intermediate" ? "warning" :
                            p.playing_level === "beginner" ? "success" : "info"
                          }>
                            {p.playing_level}
                          </Badge>
                        )}
                      </div>
                      <div className="text-right text-xs">
                        <span className="text-slate-400">Sessions</span>
                        <p className={`font-medium ${p.sessions_remaining !== null && p.sessions_remaining <= 2 ? "text-amber-600" : "text-slate-700"}`}>
                          {p.sessions_remaining !== null ? p.sessions_remaining : "No sub"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {activeTab === "schedule" && (
        <ScheduleSection
          groupId={groupId}
          schedule={schedule}
          coaches={coaches}
          onRefresh={fetchSchedule}
        />
      )}
    </div>
  );
}
