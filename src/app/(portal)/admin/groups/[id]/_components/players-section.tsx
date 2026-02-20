"use client";

import { useState, useTransition } from "react";
import { Card, Badge, Button, Drawer } from "@/components/ui";
import { Users, Plus, X, Search, Check } from "lucide-react";
import { addPlayersToGroup, removePlayerFromGroup } from "@/app/_actions/training";
import type { GroupPlayerRow, AvailablePlayer } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  async function loadAvailablePlayers() {
    const { data: allPlayers } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, playing_level")
      .eq("role", "player")
      .eq("is_active", true)
      .order("first_name");

    const currentIds = new Set(players.map((p) => p.id));
    setAvailablePlayers(
      (allPlayers || []).filter((p: { id: string }) => !currentIds.has(p.id))
    );
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
        onRefresh();
      }
    });
  }

  function handleRemovePlayer(playerId: string) {
    startTransition(async () => {
      await removePlayerFromGroup(groupId, playerId);
      onRefresh();
    });
  }

  const filteredAvailablePlayers = availablePlayers.filter((p) => {
    if (!playerSearch) return true;
    const q = playerSearch.toLowerCase();
    return `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
  });

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          Players
          <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{players.length}</span>
        </h2>
        <Button
          size="sm"
          onClick={() => { setShowAddPlayer(true); loadAvailablePlayers(); }}
        >
          <span className="flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add Players</span>
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {players.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No players in this group yet</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Name</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Level</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Sessions Left</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Joined</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {players.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
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
                    <td className="py-2.5 text-slate-500">{p.joined_at}</td>
                    <td className="py-2.5">
                      <button
                        onClick={() => handleRemovePlayer(p.id)}
                        disabled={isPending}
                        className="text-slate-400 hover:text-red-500 p-1"
                        title="Remove from group"
                      >
                        <X className="w-4 h-4" />
                      </button>
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
                <div className="flex items-center justify-between mb-2">
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
                  <button
                    onClick={() => handleRemovePlayer(p.id)}
                    disabled={isPending}
                    className="text-slate-400 hover:text-red-500 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Sessions Left</span>
                    <p className="text-slate-700 font-medium">
                      {p.sessions_remaining !== null ? p.sessions_remaining : "No sub"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Joined</span>
                    <p className="text-slate-700 font-medium">{p.joined_at}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add Player Drawer */}
      <Drawer
        open={showAddPlayer}
        onClose={() => { setShowAddPlayer(false); setSelectedPlayerIds(new Set()); }}
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
                  <span className="font-medium text-slate-900">{p.first_name} {p.last_name}</span>
                  {p.playing_level && (
                    <span className="text-xs text-slate-400 ml-2 capitalize">{p.playing_level}</span>
                  )}
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
