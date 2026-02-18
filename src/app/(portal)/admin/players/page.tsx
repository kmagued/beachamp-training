"use client";

import { useState, useEffect, useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Input, Select, Skeleton, TableRowSkeleton } from "@/components/ui";
import { Search } from "lucide-react";

interface PlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  playing_level: string | null;
  created_at: string;
  subscriptions: {
    status: string;
    sessions_remaining: number;
    sessions_total: number;
    end_date: string | null;
    packages: { name: string } | null;
  }[];
}

type StatusFilter = "all" | "active" | "expiring" | "pending" | "inactive";

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, playing_level, created_at, subscriptions(status, sessions_remaining, sessions_total, end_date, packages(name))")
        .eq("role", "player")
        .order("created_at", { ascending: false });
      if (data) setPlayers(data as unknown as PlayerRow[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPlayerStatus(player: PlayerRow) {
    const activeSub = player.subscriptions?.find((s) => s.status === "active");
    if (activeSub) {
      if (activeSub.end_date) {
        const daysLeft = Math.ceil(
          (new Date(activeSub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysLeft <= 7) return "expiring";
      }
      return "active";
    }
    const pendingSub = player.subscriptions?.find((s) => s.status === "pending");
    if (pendingSub) return "pending";
    return "inactive";
  }

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          p.first_name.toLowerCase().includes(q) ||
          p.last_name.toLowerCase().includes(q) ||
          (p.email?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      // Status filter
      if (statusFilter !== "all") {
        return getPlayerStatus(p) === statusFilter;
      }
      return true;
    });
  }, [players, search, statusFilter]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "expiring":
        return <Badge variant="warning">Expiring</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      default:
        return <Badge variant="neutral">Inactive</Badge>;
    }
  };

  const levelBadge = (level: string | null) => {
    if (!level) return <Badge variant="neutral">—</Badge>;
    switch (level) {
      case "beginner":
        return <Badge variant="info">Beginner</Badge>;
      case "intermediate":
        return <Badge variant="info">Intermediate</Badge>;
      case "advanced":
        return <Badge variant="success">Advanced</Badge>;
      case "professional":
        return <Badge variant="success">Professional</Badge>;
      default:
        return <Badge variant="neutral">{level}</Badge>;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Players</h1>
        <p className="text-slate-500 text-sm">
          {players.length} total players
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="sm:w-40"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
        </Select>
      </div>

      {loading ? (
        <>
          {/* Desktop Skeleton */}
          <Card className="hidden sm:block overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200">
                    {["Player", "Package", "Sessions", "Expires", "Level", "Status"].map((h) => (
                      <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <TableRowSkeleton key={i} columns={6} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {/* Mobile Skeleton */}
          <div className="sm:hidden space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
      <>
      {/* Desktop Table */}
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Player
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Package
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Sessions
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Expires
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Level
                </th>
                <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player, i) => {
                const activeSub = player.subscriptions?.find(
                  (s) => s.status === "active"
                );
                const status = getPlayerStatus(player);
                return (
                  <tr
                    key={player.id}
                    className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-[#FAFBFC]" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-xs text-slate-400">{player.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {activeSub?.packages?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {activeSub
                        ? `${activeSub.sessions_remaining}/${activeSub.sessions_total}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {activeSub?.end_date
                        ? new Date(activeSub.end_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {levelBadge(player.playing_level)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(status)}</td>
                  </tr>
                );
              })}
              {filteredPlayers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    {search || statusFilter !== "all"
                      ? "No players match your filters"
                      : "No players found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {filteredPlayers.map((player) => {
          const activeSub = player.subscriptions?.find((s) => s.status === "active");
          const status = getPlayerStatus(player);
          return (
            <Card key={player.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {player.first_name} {player.last_name}
                  </p>
                  <p className="text-xs text-slate-400">{player.email}</p>
                </div>
                {statusBadge(status)}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div>
                  <span className="text-slate-400">Package</span>
                  <p className="text-slate-700 font-medium">{activeSub?.packages?.name || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Sessions</span>
                  <p className="text-slate-700 font-medium">
                    {activeSub ? `${activeSub.sessions_remaining}/${activeSub.sessions_total}` : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Expires</span>
                  <p className="text-slate-700 font-medium">
                    {activeSub?.end_date ? new Date(activeSub.end_date).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Level</span>
                  <div className="mt-0.5">{levelBadge(player.playing_level)}</div>
                </div>
              </div>
            </Card>
          );
        })}
        {filteredPlayers.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">
            {search || statusFilter !== "all" ? "No players match your filters" : "No players found"}
          </p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
