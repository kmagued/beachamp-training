"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Badge, Button, Skeleton } from "@/components/ui";
import { ArrowLeft, Users, UserCheck, Calendar, Trash2 } from "lucide-react";
import Link from "next/link";
import { deleteGroup } from "@/app/_actions/training";
import { GroupModal } from "../_components/group-modal";
import { getLevelVariant } from "../_components/types";
import { PlayersSection } from "./_components/players-section";
import { CoachesSection } from "./_components/coaches-section";
import { ScheduleSection } from "./_components/schedule-section";
import type { GroupInfo, GroupPlayerRow, CoachRow, ScheduleRow } from "./_components/types";

const TABS = [
  { key: "players", label: "Players", icon: Users },
  { key: "coaches", label: "Coaches", icon: UserCheck },
  { key: "schedule", label: "Schedule", icon: Calendar },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AdminGroupDetailPage() {
  const params = useParams();
  const groupId = params.id as string;

  const router = useRouter();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();
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
      // Fetch ALL subscriptions (not filtered by status) to match players list logic
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("player_id, sessions_remaining, sessions_total, start_date, end_date, status")
        .in("player_id", playerIds.length > 0 ? playerIds : ["__none__"])
        .order("created_at", { ascending: false });

      // Group all subscriptions by player
      const subsByPlayer = new Map<string, typeof allSubs>();
      type SubRow = { player_id: string; sessions_remaining: number; sessions_total: number; start_date: string | null; end_date: string | null; status: string };
      const allSubs = (subs || []) as SubRow[];
      for (const s of allSubs) {
        const existing = subsByPlayer.get(s.player_id) || [];
        existing.push(s);
        subsByPlayer.set(s.player_id, existing);
      }

      // Use the same status logic as the players list
      function resolveStatus(playerSubs: SubRow[]): { sessions_remaining: number | null; sessions_total: number | null; end_date: string | null; sub_status: string | null } {
        if (!playerSubs.length) return { sessions_remaining: null, sessions_total: null, end_date: null, sub_status: null };

        const now = Date.now();
        // Find effectively active subs
        const activeSubs = playerSubs.filter((s) => {
          if (s.status !== "active" && s.status !== "pending") return false;
          if (s.sessions_remaining <= 0) return false;
          if (s.end_date && new Date(s.end_date).getTime() < now) return false;
          return true;
        });

        // Pick the one covering today, or the nearest upcoming, or the first active
        const activeSub =
          activeSubs.find((s) => {
            const start = s.start_date ? new Date(s.start_date).getTime() : 0;
            const end = s.end_date ? new Date(s.end_date).getTime() : Infinity;
            return start <= now && now <= end;
          }) ||
          activeSubs.filter((s) => s.start_date && new Date(s.start_date).getTime() > now)
            .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime())[0] ||
          activeSubs[0] || null;

        if (activeSub) {
          return { sessions_remaining: activeSub.sessions_remaining, sessions_total: activeSub.sessions_total, end_date: activeSub.end_date, sub_status: activeSub.status };
        }

        // Frozen
        const frozen = playerSubs.find((s) => s.status === "frozen");
        if (frozen) return { sessions_remaining: frozen.sessions_remaining, sessions_total: frozen.sessions_total, end_date: frozen.end_date, sub_status: "frozen" };

        // Expired
        const expired = playerSubs.find((s) => s.status === "expired");
        if (expired) return { sessions_remaining: expired.sessions_remaining, sessions_total: expired.sessions_total, end_date: expired.end_date, sub_status: "expired" };

        // Pending
        const pendingPayment = playerSubs.find((s) => s.status === "pending_payment");
        if (pendingPayment) return { sessions_remaining: pendingPayment.sessions_remaining, sessions_total: pendingPayment.sessions_total, end_date: pendingPayment.end_date, sub_status: "pending_payment" };

        const pending = playerSubs.find((s) => s.status === "pending");
        if (pending) return { sessions_remaining: pending.sessions_remaining, sessions_total: pending.sessions_total, end_date: pending.end_date, sub_status: "pending" };

        return { sessions_remaining: null, sessions_total: null, end_date: null, sub_status: null };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPlayers(data.map((gp: any) => {
        const playerSubs = subsByPlayer.get(gp.profiles?.id) || [];
        const resolved = resolveStatus(playerSubs);
        return {
          id: gp.profiles?.id || "",
          first_name: gp.profiles?.first_name || "",
          last_name: gp.profiles?.last_name || "",
          playing_level: gp.profiles?.playing_level,
          sessions_remaining: resolved.sessions_remaining,
          sessions_total: resolved.sessions_total,
          end_date: resolved.end_date,
          sub_status: resolved.sub_status,
          joined_at: gp.joined_at,
        };
      }));
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
      .select("id, day_of_week, start_time, end_time, location, end_date, coach_id, profiles!schedule_sessions_coach_id_fkey(first_name, last_name)")
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
        end_date: s.end_date,
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
        <Link href="/admin/groups" className="text-primary hover:underline text-sm mt-2 inline-block">
          Back to Groups
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/groups" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Groups
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{group.name}</h1>
            <Badge variant={getLevelVariant(group.level)}>{group.level}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowEditModal(true)}
            >
              Edit
            </Button>
            <button
              onClick={() => { setShowDeleteConfirm(true); setDeleteError(null); }}
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete group"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {group.description && <p className="text-slate-500 text-sm mt-1">{group.description}</p>}
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Group</h3>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to delete <span className="font-medium">{group.name}</span>? This action cannot be undone.
            </p>
            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <button
                onClick={() => {
                  startDeleteTransition(async () => {
                    const result = await deleteGroup(groupId);
                    if ("error" in result) {
                      setDeleteError(result.error);
                    } else {
                      router.push("/admin/groups");
                    }
                  });
                }}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Drawer */}
      <GroupModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={fetchGroup}
        editingGroup={group ? { ...group, player_count: players.length, coaches: [], schedule: [] } : null}
      />

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
      {activeTab === "players" && (
        <PlayersSection
          groupId={groupId}
          groupName={group.name}
          players={players}
          onRefresh={() => { fetchPlayers(); fetchGroup(); }}
          supabase={supabase}
        />
      )}

      {activeTab === "coaches" && (
        <CoachesSection
          groupId={groupId}
          coaches={coaches}
          onRefresh={fetchCoaches}
          supabase={supabase}
        />
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
