"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { Pagination, SelectionBar, Button } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { Plus, Users, ChevronDown, Loader2, Check } from "lucide-react";
import type { PlayerRow, SortField, SortDir } from "./_components/types";
import { getPlayerStatus } from "./_components/types";
import { updatePlayerLevel } from "./[id]/actions";
import { PlayersPageSkeleton, PlayersInlineSkeleton } from "./_components/skeleton";
import { PlayersFilters } from "./_components/filters";
import { PlayersTableView } from "./_components/table";
import { PlayerDrawer } from "./_components/player-drawer";

export default function AdminPlayersPage() {
  return (
    <Suspense fallback={<PlayersPageSkeleton />}>
      <AdminPlayersContent />
    </Suspense>
  );
}

function AdminPlayersContent() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [packageFilter, setPackageFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [drawerPlayer, setDrawerPlayer] = useState<PlayerRow | null>(null);
  const PAGE_SIZE = 10;

  const { getRowId, isHighlighted } = useHighlightRow();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, date_of_birth, area, playing_level, training_goals, health_conditions, height, weight, preferred_hand, preferred_position, guardian_name, guardian_phone, is_active, created_at, subscriptions(status, sessions_remaining, sessions_total, start_date, end_date, packages(name))")
      .eq("role", "player")
      .order("created_at", { ascending: false });
    if (data) setPlayers(data as unknown as PlayerRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  // Re-fetch when window regains focus (picks up attendance changes etc.)
  useEffect(() => {
    let lastFetch = Date.now();
    function handleFocus() {
      if (Date.now() - lastFetch > 30_000) {
        lastFetch = Date.now();
        fetchPlayers();
      }
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchPlayers]);

  // Unique package names for filter dropdown
  const packageNames = useMemo(() => {
    const names = new Set<string>();
    players.forEach((p) => {
      p.subscriptions?.forEach((s) => {
        if (s.packages?.name) names.add(s.packages.name);
      });
    });
    return Array.from(names).sort();
  }, [players]);

  const levelOrder: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2, professional: 3 };

  const filteredPlayers = useMemo(() => {
    const result = players.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
        const matchesSearch =
          fullName.includes(q) ||
          (p.email?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      if (statusFilter) {
        const selected = statusFilter.split(",").map((s) => s.toLowerCase());
        if (!selected.includes(getPlayerStatus(p))) return false;
      }
      if (levelFilter) {
        const selected = levelFilter.split(",").map((s) => s.toLowerCase());
        if (!p.playing_level || !selected.includes(p.playing_level)) return false;
      }
      if (packageFilter) {
        const selected = packageFilter.split(",");
        const activePackage = p.subscriptions?.find((s) => s.status === "active")?.packages?.name;
        if (!activePackage || !selected.includes(activePackage)) return false;
      }
      return true;
    });

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        const aName = `${a.first_name} ${a.last_name}`.toLowerCase();
        const bName = `${b.first_name} ${b.last_name}`.toLowerCase();
        cmp = aName.localeCompare(bName);
      } else if (sortField === "date") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === "level") {
        cmp = (levelOrder[a.playing_level ?? ""] ?? 99) - (levelOrder[b.playing_level ?? ""] ?? 99);
      } else if (sortField === "package") {
        const aName = a.subscriptions?.find((s) => s.status === "active")?.packages?.name ?? "";
        const bName = b.subscriptions?.find((s) => s.status === "active")?.packages?.name ?? "";
        cmp = aName.localeCompare(bName);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [players, search, statusFilter, levelFilter, packageFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredPlayers.length / PAGE_SIZE);
  const paginatedPlayers = filteredPlayers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, levelFilter, packageFilter]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const pageIds = paginatedPlayers.map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected && !allPageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allPageSelected, pageIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  }

  const hasActiveFilters = !!search || !!statusFilter || !!levelFilter || !!packageFilter;

  // Add to Group
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [addGroupSuccess, setAddGroupSuccess] = useState<string | null>(null);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const [changingLevelId, setChangingLevelId] = useState<string | null>(null);

  const handleLevelChange = useCallback(async (playerId: string, newLevel: string | null) => {
    setChangingLevelId(playerId);
    const result = await updatePlayerLevel(playerId, newLevel);
    if (result.error) {
      alert(result.error);
    } else {
      setPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, playing_level: newLevel } : p))
      );
      setDrawerPlayer((prev) => prev && prev.id === playerId ? { ...prev, playing_level: newLevel } : prev);
    }
    setChangingLevelId(null);
  }, []);

  useEffect(() => {
    supabase.from("groups").select("id, name").eq("is_active", true).order("name").then(({ data }) => {
      if (data) setGroups(data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!groupDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [groupDropdownOpen]);

  async function handleAddToGroup(groupId: string) {
    setAddingToGroup(true);
    const rows = Array.from(selectedIds).map((playerId) => ({
      group_id: groupId,
      player_id: playerId,
      is_active: true,
    }));
    await supabase.from("group_players").upsert(rows, { onConflict: "group_id,player_id" });
    const groupName = groups.find((g) => g.id === groupId)?.name || "group";
    setAddGroupSuccess(`Added ${selectedIds.size} player${selectedIds.size > 1 ? "s" : ""} to ${groupName}`);
    setAddingToGroup(false);
    setGroupDropdownOpen(false);
    setSelectedIds(new Set());
    setTimeout(() => setAddGroupSuccess(null), 3000);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Players</h1>
          <p className="text-slate-500 text-sm">
            {players.length} total players
            {hasActiveFilters && ` · ${filteredPlayers.length} matching`}
          </p>
        </div>
        <Link href="/admin/players/add">
          <Button>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add Players
            </span>
          </Button>
        </Link>
      </div>

      <PlayersFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        packageFilter={packageFilter}
        onPackageFilterChange={setPackageFilter}
        packageOptions={packageNames}
        onReset={() => { setSearch(""); setStatusFilter(""); setLevelFilter(""); setPackageFilter(""); }}
        hasActiveFilters={hasActiveFilters}
      />

      <SelectionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <div className="relative" ref={groupDropdownRef}>
          <button
            onClick={() => setGroupDropdownOpen((o) => !o)}
            disabled={addingToGroup}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Users className="w-3.5 h-3.5" />
            Add to Group
            <ChevronDown className="w-3 h-3" />
          </button>
          {groupDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
              {groups.length > 0 ? (
                groups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => handleAddToGroup(group.id)}
                    disabled={addingToGroup}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {addingToGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2" /> : null}
                    {group.name}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-slate-400">No active groups</p>
              )}
            </div>
          )}
        </div>
      </SelectionBar>
      {addGroupSuccess && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          <Check className="w-4 h-4" /> {addGroupSuccess}
        </div>
      )}

      <div className="flex-1">
        {loading ? (
          <PlayersInlineSkeleton />
        ) : (
          <PlayersTableView
            players={paginatedPlayers}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            allPageSelected={allPageSelected}
            selectAllRef={selectAllRef}
            getRowId={getRowId}
            isHighlighted={isHighlighted}
            sortField={sortField}
            sortDir={sortDir}
            toggleSort={toggleSort}
            hasActiveFilters={hasActiveFilters}
            onPlayerClick={setDrawerPlayer}
            onLevelChange={handleLevelChange}
            changingLevelId={changingLevelId}
          />
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      <PlayerDrawer
        player={drawerPlayer}
        onClose={() => setDrawerPlayer(null)}
        onDataChange={fetchPlayers}
      />
    </div>
  );
}
