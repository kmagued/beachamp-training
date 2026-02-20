"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Skeleton } from "@/components/ui";
import { Users, Calendar, Clock } from "lucide-react";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface GroupInfo {
  id: string;
  name: string;
  level: string;
  max_players: number;
  player_count: number;
  schedule: { day_of_week: number; start_time: string; end_time: string; location: string | null }[];
  players: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    sessions_remaining: number | null;
    last_attendance: string | null;
  }[];
}

interface CoachGroupsProps {
  coachId: string;
  isAdmin: boolean;
}

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

export function CoachGroups({ coachId, isAdmin }: CoachGroupsProps) {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      // Get groups
      let groupIds: string[] = [];

      if (isAdmin) {
        // Admin sees all active groups
        const { data: allGroups } = await supabase
          .from("groups")
          .select("id")
          .eq("is_active", true);
        groupIds = (allGroups || []).map((g: { id: string }) => g.id);
      } else {
        // Coach sees only assigned groups
        const { data: coachGroups } = await supabase
          .from("coach_groups")
          .select("group_id")
          .eq("coach_id", coachId)
          .eq("is_active", true);
        groupIds = (coachGroups || []).map((cg: { group_id: string }) => cg.group_id);
      }

      if (groupIds.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const { data: groupData } = await supabase
        .from("groups")
        .select("*")
        .in("id", groupIds)
        .eq("is_active", true)
        .order("name");

      if (!groupData) {
        setLoading(false);
        return;
      }

      const enriched: GroupInfo[] = await Promise.all(
        groupData.map(async (g: { id: string; name: string; level: string; max_players: number }) => {
          // Get player count
          const { count } = await supabase
            .from("group_players")
            .select("*", { count: "exact", head: true })
            .eq("group_id", g.id)
            .eq("is_active", true);

          // Get schedule
          const { data: schedule } = await supabase
            .from("schedule_sessions")
            .select("day_of_week, start_time, end_time, location")
            .eq("group_id", g.id)
            .eq("is_active", true)
            .order("day_of_week")
            .order("start_time");

          // Get players with details
          const { data: playerData } = await supabase
            .from("group_players")
            .select("player_id, profiles!group_players_player_id_fkey(id, first_name, last_name, phone)")
            .eq("group_id", g.id)
            .eq("is_active", true);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const players: { id: string; first_name: string; last_name: string; phone: string | null; sessions_remaining: number | null; last_attendance: string | null }[] = (playerData || []).map((gp: any) => ({
            id: gp.profiles?.id || "",
            first_name: gp.profiles?.first_name || "",
            last_name: gp.profiles?.last_name || "",
            phone: gp.profiles?.phone,
            sessions_remaining: null as number | null,
            last_attendance: null as string | null,
          })).filter((p: { id: string }) => p.id);

          // Get subscriptions for these players
          const playerIds = players.map((p: { id: string }) => p.id);
          if (playerIds.length > 0) {
            const { data: subs } = await supabase
              .from("subscriptions")
              .select("player_id, sessions_remaining")
              .in("player_id", playerIds)
              .eq("status", "active");

            if (subs) {
              const subMap = new Map(subs.map((s: { player_id: string; sessions_remaining: number }) => [s.player_id, s.sessions_remaining]));
              for (const p of players) {
                p.sessions_remaining = subMap.get(p.id) ?? null;
              }
            }
          }

          return {
            id: g.id,
            name: g.name,
            level: g.level,
            max_players: g.max_players,
            player_count: count || 0,
            schedule: schedule || [],
            players,
          };
        })
      );

      setGroups(enriched);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, isAdmin]);

  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <Skeleton className="h-5 w-32 mb-2" />
            <Skeleton className="h-4 w-24 mb-4" />
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-3 w-3/4" />
          </Card>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        {isAdmin
          ? "No active groups found. Create one from the Groups page."
          : "You haven't been assigned to any groups yet. Contact your administrator."}
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {groups.map((group) => {
        const isExpanded = expandedGroup === group.id;
        const scheduleText = group.schedule.length > 0
          ? group.schedule.map((s) => DAY_NAMES[s.day_of_week]).join(", ")
          : "No schedule";
        const firstTime = group.schedule[0];

        return (
          <Card key={group.id} className="flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">{group.name}</h3>
                <Badge variant={getLevelVariant(group.level)}>
                  {group.level}
                </Badge>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium text-slate-900">{group.player_count}</span>
                  <span className="text-slate-400">/ {group.max_players}</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min((group.player_count / group.max_players) * 100, 100)}%` }}
              />
            </div>

            {/* Schedule Summary */}
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
              <Calendar className="w-3.5 h-3.5" />
              <span>{scheduleText}</span>
              {firstTime && (
                <>
                  <span>&middot;</span>
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTime(firstTime.start_time)}</span>
                </>
              )}
            </div>

            {/* Expand button */}
            <button
              onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
              className="text-xs font-medium text-primary hover:underline self-start mb-2"
            >
              {isExpanded ? "Hide Players" : `View ${group.player_count} Players`}
            </button>

            {/* Expanded player list */}
            {isExpanded && (
              <div className="mt-2 border-t border-slate-100 pt-3 space-y-2">
                {group.players.length === 0 ? (
                  <p className="text-xs text-slate-400">No players assigned</p>
                ) : (
                  group.players.map((player) => (
                    <div key={player.id} className="flex items-center justify-between text-sm py-1">
                      <div>
                        <span className="font-medium text-slate-900">
                          {player.first_name} {player.last_name}
                        </span>
                        {player.phone && (
                          <span className="text-xs text-slate-400 ml-2">{player.phone}</span>
                        )}
                      </div>
                      {player.sessions_remaining !== null && (
                        <span className={`text-xs ${player.sessions_remaining <= 2 ? "text-amber-500" : "text-slate-400"}`}>
                          {player.sessions_remaining} left
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
