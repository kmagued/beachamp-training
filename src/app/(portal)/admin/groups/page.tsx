"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, StatCard, Skeleton, Drawer } from "@/components/ui";
import { toggleGroupActive, deleteGroup } from "@/app/_actions/training";
import { UsersRound, Plus, Pencil, Calendar, Users, Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { GroupModal } from "./_components/group-modal";
import { DAY_NAMES, formatTime, getLevelVariant } from "./_components/types";
import type { GroupData } from "./_components/types";

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupData | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupData | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  async function fetchGroups() {
    const { data: groupData } = await supabase.from("groups").select("*").order("name");

    if (!groupData) {
      setLoading(false);
      return;
    }

    const enriched: GroupData[] = await Promise.all(
      groupData.map(async (g) => {
        const { count } = await supabase
          .from("group_players")
          .select("*", { count: "exact", head: true })
          .eq("group_id", g.id)
          .eq("is_active", true);

        const { data: coachData } = await supabase
          .from("coach_groups")
          .select("coach_id, is_primary, profiles!coach_groups_coach_id_fkey(first_name, last_name)")
          .eq("group_id", g.id)
          .eq("is_active", true);

        const { data: schedData } = await supabase
          .from("schedule_sessions")
          .select("day_of_week, start_time, end_time")
          .eq("group_id", g.id)
          .eq("is_active", true)
          .order("day_of_week")
          .order("start_time");

        return {
          ...g,
          player_count: count || 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          coaches: (coachData || []).map((c: any) => ({
            id: c.coach_id,
            first_name: c.profiles?.first_name || "",
            last_name: c.profiles?.last_name || "",
            is_primary: c.is_primary,
          })),
          schedule: schedData || [],
        };
      }),
    );

    setGroups(enriched);
    setLoading(false);
  }

  useEffect(() => {
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleToggleActive(id: string) {
    startTransition(async () => {
      await toggleGroupActive(id);
      fetchGroups();
    });
  }

  function handleDelete(group: GroupData) {
    setError(null);
    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if ("error" in result) {
        setError((result as { error: string }).error);
      } else {
        fetchGroups();
      }
      setDeletingGroup(null);
    });
  }

  function openCreate() {
    setEditingGroup(null);
    setShowModal(true);
  }

  function openEdit(group: GroupData) {
    setEditingGroup(group);
    setShowModal(true);
  }

  const activeGroups = groups.filter((g) => g.is_active);
  const totalPlayers = activeGroups.reduce((sum, g) => sum + g.player_count, 0);

  const [unassignedCount, setUnassignedCount] = useState(0);
  useEffect(() => {
    async function countUnassigned() {
      const { count: totalPlayerCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "player")
        .eq("is_active", true);

      const { data: assignedPlayers } = await supabase.from("group_players").select("player_id").eq("is_active", true);

      const assignedSet = new Set((assignedPlayers || []).map((gp: { player_id: string }) => gp.player_id));
      setUnassignedCount((totalPlayerCount || 0) - assignedSet.size);
    }
    if (!loading) countUnassigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Training Groups</h1>
          <p className="text-slate-500 text-sm">Manage groups, players, and schedules</p>
        </div>
        {groups.length > 0 && (
          <Button onClick={openCreate} size="sm" className="shrink-0">
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Group</span>
              <span className="sm:hidden">New</span>
            </span>
          </Button>
        )}
      </div>

      {/* Stats */}
      {groups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <StatCard
            label="Active Groups"
            value={activeGroups.length}
            accentColor="bg-primary"
            icon={<UsersRound className="w-5 h-5" />}
          />
          <StatCard
            label="Players Assigned"
            value={totalPlayers}
            accentColor="bg-emerald-500"
            icon={<Users className="w-5 h-5" />}
          />
          <StatCard
            label="Unassigned Players"
            value={unassignedCount}
            accentColor={unassignedCount > 0 ? "bg-amber-500" : "bg-slate-300"}
            icon={<Users className="w-5 h-5" />}
          />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
      )}

      {/* Create/Edit Modal */}
      <GroupModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingGroup(null);
        }}
        onSuccess={fetchGroups}
        editingGroup={editingGroup}
      />

      {/* Groups Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-2 w-full mb-3 rounded-full" />
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-3/4 mb-4" />
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1 rounded-lg" />
                <Skeleton className="h-8 flex-1 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UsersRound className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-1">No training groups yet</h3>
          <p className="text-sm text-slate-400 mb-5">Create your first group to start organizing players and schedules.</p>
          <Button onClick={openCreate} size="sm">
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Create Group
            </span>
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => {
            const scheduleText =
              group.schedule.length > 0
                ? group.schedule.map((s) => DAY_NAMES[s.day_of_week]).join(", ")
                : "No schedule";
            const firstTime = group.schedule[0];

            return (
              <Link key={group.id} href={`/admin/groups/${group.id}`}>
                <Card className={`h-full hover:shadow-md transition-shadow cursor-pointer ${!group.is_active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{group.name}</h3>
                      <Badge variant={getLevelVariant(group.level)}>{group.level}</Badge>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                      <button onClick={() => openEdit(group)} className="text-slate-400 hover:text-slate-600 p-1">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingGroup(group)}
                        className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-500">Players</span>
                    <span className="font-medium text-slate-900">
                      {group.player_count} / {group.max_players}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                    <div
                      className={`h-full rounded-full transition-all ${group.player_count >= group.max_players ? "bg-red-500" : "bg-primary"}`}
                      style={{ width: `${Math.min((group.player_count / group.max_players) * 100, 100)}%` }}
                    />
                  </div>

                  <div className="text-sm mb-2">
                    <span className="text-slate-500">Coaches: </span>
                    {group.coaches.length > 0 ? (
                      group.coaches.map((c, i) => (
                        <span key={c.id}>
                          <span className={`font-medium ${c.is_primary ? "text-primary" : "text-slate-700"}`}>
                            {c.first_name} {c.last_name}
                          </span>
                          {c.is_primary && <span className="text-[10px] text-primary ml-0.5">(P)</span>}
                          {i < group.coaches.length - 1 && ", "}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{scheduleText}</span>
                      {firstTime && (
                        <>
                          <span>&middot;</span>
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(firstTime.start_time)}</span>
                        </>
                      )}
                    </div>
                    <div onClick={(e) => e.preventDefault()}>
                      <button
                        onClick={() => handleToggleActive(group.id)}
                        disabled={isPending}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          group.is_active
                            ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                      >
                        {group.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Drawer */}
      <Drawer
        open={!!deletingGroup}
        onClose={() => setDeletingGroup(null)}
        title="Delete Group"
        footer={deletingGroup ? (
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeletingGroup(null)} disabled={isPending}>
              Cancel
            </Button>
            <button
              onClick={() => handleDelete(deletingGroup)}
              disabled={isPending}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              {isPending ? "Deleting..." : "Delete"}
            </button>
          </div>
        ) : undefined}
      >
        {deletingGroup && (
          <div className="text-center">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-sm text-slate-500">
              Are you sure you want to delete <span className="font-medium text-slate-700">{deletingGroup.name}</span>
              ? This action cannot be undone.
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
