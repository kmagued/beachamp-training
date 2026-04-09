"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Skeleton } from "@/components/ui";
import { Users, UsersRound, Calendar, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";

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
  const groupBasePath = isAdmin ? "/admin/groups" : "/coach/groups";

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      // 1. Resolve group IDs the user has access to
      let groupIds: string[] = [];
      if (isAdmin) {
        const { data: allGroups } = await supabase
          .from("groups")
          .select("id")
          .eq("is_active", true);
        groupIds = (allGroups || []).map((g: { id: string }) => g.id);
      } else {
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

      // 2. Batch fetch all data in 3 parallel queries (no per-group N+1)
      const today = new Date().toISOString().split("T")[0];
      const [
        { data: groupData },
        { data: groupPlayersData },
        { data: scheduleData },
      ] = await Promise.all([
        supabase
          .from("groups")
          .select("id, name, level, max_players")
          .in("id", groupIds)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("group_players")
          .select("group_id")
          .in("group_id", groupIds)
          .eq("is_active", true),
        supabase
          .from("schedule_sessions")
          .select("group_id, day_of_week, start_time, end_time, location")
          .in("group_id", groupIds)
          .eq("is_active", true)
          .or(`end_date.is.null,end_date.gte.${today}`)
          .order("day_of_week")
          .order("start_time"),
      ]);

      if (!groupData) {
        setLoading(false);
        return;
      }

      // Build lookup maps
      const countByGroup = new Map<string, number>();
      for (const gp of (groupPlayersData || []) as { group_id: string }[]) {
        countByGroup.set(gp.group_id, (countByGroup.get(gp.group_id) || 0) + 1);
      }
      const scheduleByGroup = new Map<string, GroupInfo["schedule"]>();
      for (const s of (scheduleData || []) as { group_id: string; day_of_week: number; start_time: string; end_time: string; location: string | null }[]) {
        const list = scheduleByGroup.get(s.group_id) || [];
        list.push({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time, location: s.location });
        scheduleByGroup.set(s.group_id, list);
      }

      const enriched: GroupInfo[] = (groupData as { id: string; name: string; level: string; max_players: number }[]).map((g) => ({
        id: g.id,
        name: g.name,
        level: g.level,
        max_players: g.max_players,
        player_count: countByGroup.get(g.id) || 0,
        schedule: scheduleByGroup.get(g.id) || [],
        players: [],
      }));

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
      <div className="text-center py-16">
        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <UsersRound className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-700 mb-1">No groups yet</h3>
        <p className="text-sm text-slate-400">
          {isAdmin
            ? "No active groups found. Create one from the Groups page."
            : "You haven't been assigned to any groups yet. Contact your administrator."}
        </p>
        {isAdmin && (
          <Link
            href="/admin/groups"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 mt-4"
          >
            Go to Groups
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
      {groups.map((group) => {
        const scheduleText = group.schedule.length > 0
          ? group.schedule.map((s) => DAY_NAMES[s.day_of_week]).join(", ")
          : "No schedule";
        const firstTime = group.schedule[0];

        return (
          <Link key={group.id} href={`${groupBasePath}/${group.id}`}>
            <Card className="h-full flex flex-col hover:shadow-md transition-shadow cursor-pointer">
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
              <div className="flex items-center gap-2 text-xs text-slate-500">
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
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
