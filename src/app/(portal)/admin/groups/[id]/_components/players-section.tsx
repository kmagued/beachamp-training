"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { Card, Badge, Button, Drawer, Toast } from "@/components/ui";
import { Users, Plus, X, Search, Check, ChevronUp, ChevronDown } from "lucide-react";
import { addPlayersToGroup, removePlayersFromGroup } from "@/app/_actions/training";
import type { GroupPlayerRow, AvailablePlayer } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

type SortField = "name" | "sessions" | "status";
type SortDir = "asc" | "desc";

function getStatus(player: GroupPlayerRow): { label: string; variant: "success" | "warning" | "danger" | "neutral" | "info"; priority: number } {
  const { sessions_remaining, sessions_total, end_date, sub_status } = player;

  // No subscription at all
  if (sub_status === null) return { label: "No Sub", variant: "neutral", priority: 5 };

  if (sub_status === "frozen") return { label: "Frozen", variant: "info", priority: 2 };
  if (sub_status === "pending" || sub_status === "pending_payment") return { label: "Pending", variant: "warning", priority: 3 };
  if (sub_status === "expired") {
    if (sessions_total === 1) return { label: "Attended", variant: "neutral", priority: 4 };
    return { label: "Expired", variant: "danger", priority: 4 };
  }
  if (sub_status === "cancelled") return { label: "Cancelled", variant: "neutral", priority: 5 };

  // Active subscription checks
  if (sessions_remaining === null || sessions_remaining <= 0) return { label: "Expired", variant: "danger", priority: 4 };
  if (end_date && new Date(end_date).getTime() < Date.now()) return { label: "Expired", variant: "danger", priority: 4 };

  // Expiring soon
  const total = sessions_total || 1;
  const daysLeft = end_date ? Math.ceil((new Date(end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  if (total > 1 && ((daysLeft !== null && daysLeft <= 10) || sessions_remaining / total <= 0.3)) {
    return { label: "Expiring Soon", variant: "warning", priority: 1 };
  }

  return { label: "Active", variant: "success", priority: 0 };
}

interface PlayersSectionProps {
  groupId: string;
  groupName: string;
  players: GroupPlayerRow[];
  onRefresh: () => void;
  supabase: SupabaseClient;
}

export function PlayersSection({ groupId, groupName, players, onRefresh, supabase }: PlayersSectionProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedPlayers = useMemo(() => {
    const sorted = [...players];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      } else if (sortField === "status") {
        cmp = getStatus(a).priority - getStatus(b).priority;
      } else {
        if (a.sessions_remaining === null && b.sessions_remaining === null) cmp = 0;
        else if (a.sessions_remaining === null) cmp = 1;
        else if (b.sessions_remaining === null) cmp = -1;
        else cmp = a.sessions_remaining - b.sessions_remaining;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [players, sortField, sortDir]);

  async function loadAvailablePlayers() {
    const { data: allPlayers } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, playing_level")
      .eq("role", "player")
      .eq("is_active", true)
      .order("first_name");

    const currentIds = new Set(players.map((p) => p.id));
    setAvailablePlayers((allPlayers || []).filter((p: { id: string }) => !currentIds.has(p.id)));
  }

  function handleAddPlayers() {
    if (selectedPlayerIds.size === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await addPlayersToGroup(groupId, Array.from(selectedPlayerIds));
      if ("error" in result) setError(result.error);
      else {
        setShowAddPlayer(false);
        setSelectedPlayerIds(new Set());
        setToast({ message: `${selectedPlayerIds.size} player(s) added`, variant: "success" });
        onRefresh();
      }
    });
  }

  function handleBulkRemove() {
    if (selectedForRemoval.size === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await removePlayersFromGroup(groupId, Array.from(selectedForRemoval));
      if ("error" in result) setError(result.error);
      else {
        setToast({ message: `${selectedForRemoval.size} player(s) removed`, variant: "success" });
        setSelectedForRemoval(new Set());
        onRefresh();
      }
    });
  }

  function toggleRemovalSelection(playerId: string) {
    setSelectedForRemoval((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedForRemoval.size === players.length) {
      setSelectedForRemoval(new Set());
    } else {
      setSelectedForRemoval(new Set(players.map((p) => p.id)));
    }
  }

  const filteredAvailablePlayers = availablePlayers.filter((p) => {
    if (!playerSearch) return true;
    const q = playerSearch.toLowerCase();
    return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
  });

  const allSelected = players.length > 0 && selectedForRemoval.size === players.length;
  const hasSelection = selectedForRemoval.size > 0;

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-primary" />
    ) : (
      <ChevronDown className="w-3 h-3 text-primary" />
    );
  }

  return (
    <Card className="mb-6 overflow-hidden">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={handleToastClose} />
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            Players
            <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{players.length}</span>
          </h2>
          {!hasSelection && (
            <Button
              size="sm"
              onClick={() => {
                setShowAddPlayer(true);
                loadAvailablePlayers();
              }}
            >
              <span className="flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Players</span>
                <span className="sm:hidden">Add</span>
              </span>
            </Button>
          )}
        </div>
        {hasSelection && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="secondary" onClick={() => setSelectedForRemoval(new Set())} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <button
              onClick={handleBulkRemove}
              disabled={isPending}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {isPending ? "Removing..." : `Remove (${selectedForRemoval.size})`}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      {players.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No players in this group yet</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="table-checkbox"
                    />
                  </th>
                  <th
                    className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2 cursor-pointer hover:text-slate-600 select-none"
                    onClick={() => toggleSort("name")}
                  >
                    <span className="flex items-center gap-1">
                      Name <SortIcon field="name" />
                    </span>
                  </th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">
                    Level
                  </th>
                  <th
                    className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2 cursor-pointer hover:text-slate-600 select-none"
                    onClick={() => toggleSort("sessions")}
                  >
                    <span className="flex items-center gap-1">
                      Sessions Left <SortIcon field="sessions" />
                    </span>
                  </th>
                  <th
                    className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2 cursor-pointer hover:text-slate-600 select-none"
                    onClick={() => toggleSort("status")}
                  >
                    <span className="flex items-center gap-1">
                      Status <SortIcon field="status" />
                    </span>
                  </th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPlayers.map((p) => (
                  <tr
                    key={p.id}
                    className={`cursor-pointer transition-colors ${selectedForRemoval.has(p.id) ? "bg-primary/5" : "hover:bg-slate-50/50"}`}
                    onClick={() => toggleRemovalSelection(p.id)}
                  >
                    <td className="py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedForRemoval.has(p.id)}
                        onChange={() => toggleRemovalSelection(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="table-checkbox"
                      />
                    </td>
                    <td className="py-2.5 font-medium text-slate-900">
                      {p.first_name} {p.last_name}
                    </td>
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
                    <td className="py-2.5">
                      <Badge variant={getStatus(p).variant}>
                        {getStatus(p).label}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-slate-500">{p.joined_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden">
            {/* Mobile sort controls */}
            <div className="flex gap-1.5 mb-2">
              <button
                onClick={() => toggleSort("name")}
                className={`text-xs px-2 py-1 rounded-md flex items-center gap-0.5 ${
                  sortField === "name" ? "bg-primary/10 text-primary font-medium" : "text-slate-400"
                }`}
              >
                Name <SortIcon field="name" />
              </button>
              <button
                onClick={() => toggleSort("sessions")}
                className={`text-xs px-2 py-1 rounded-md flex items-center gap-0.5 ${
                  sortField === "sessions" ? "bg-primary/10 text-primary font-medium" : "text-slate-400"
                }`}
              >
                Sessions <SortIcon field="sessions" />
              </button>
              <button
                onClick={() => toggleSort("status")}
                className={`text-xs px-2 py-1 rounded-md flex items-center gap-0.5 ${
                  sortField === "status" ? "bg-primary/10 text-primary font-medium" : "text-slate-400"
                }`}
              >
                Status <SortIcon field="status" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {sortedPlayers.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 py-2.5 cursor-pointer transition-colors ${
                    selectedForRemoval.has(p.id) ? "bg-primary/5" : ""
                  }`}
                  onClick={() => toggleRemovalSelection(p.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedForRemoval.has(p.id)}
                    onChange={() => toggleRemovalSelection(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="table-checkbox shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {p.first_name} {p.last_name}
                      </p>
                      <Badge variant={getStatus(p).variant}>
                        {getStatus(p).label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      {p.playing_level && <span className="capitalize">{p.playing_level}</span>}
                      {p.playing_level && <span>·</span>}
                      <span>
                        {p.sessions_remaining !== null ? (
                          <span className={p.sessions_remaining <= 2 ? "text-amber-600 font-medium" : ""}>
                            {p.sessions_remaining} sessions
                          </span>
                        ) : "No sub"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Add Player Drawer */}
      <Drawer
        open={showAddPlayer}
        onClose={() => {
          setShowAddPlayer(false);
          setSelectedPlayerIds(new Set());
        }}
        title={`Add Players to ${groupName}`}
        width="max-w-lg"
      >
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="space-y-1 mb-4">
          {filteredAvailablePlayers.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No available players</p>
          ) : (
            filteredAvailablePlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPlayerIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    return next;
                  });
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedPlayerIds.has(p.id)
                    ? "bg-primary-50 border border-primary"
                    : "hover:bg-slate-50 border border-transparent"
                }`}
              >
                <div>
                  <span className="font-medium text-slate-900">
                    {p.first_name} {p.last_name}
                  </span>
                  {p.playing_level && <span className="text-xs text-slate-400 ml-2 capitalize">{p.playing_level}</span>}
                </div>
                {selectedPlayerIds.has(p.id) && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))
          )}
        </div>

        <div className="sticky bottom-0 pt-3 border-t border-slate-200 flex items-center justify-between bg-white">
          <span className="text-sm text-slate-500">{selectedPlayerIds.size} selected</span>
          <Button onClick={handleAddPlayers} disabled={selectedPlayerIds.size === 0 || isPending} size="sm">
            {isPending ? "Adding..." : `Add ${selectedPlayerIds.size} Players`}
          </Button>
        </div>
      </Drawer>
    </Card>
  );
}
