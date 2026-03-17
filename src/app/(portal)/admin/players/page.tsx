"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Pagination, SelectionBar, Button } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { Plus, Users, ChevronDown, Loader2, Check, GraduationCap } from "lucide-react";
import type { PlayerRow, SortField, SortDir } from "./_components/types";
import { getActivityStatus, getSubscriptionStatus, getLatestSubscription, isEffectivelyActive } from "./_components/types";
import { updatePlayerLevel, bulkUpdatePlayerLevel } from "./[id]/actions";
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

const VALID_SORT_FIELDS: SortField[] = ["name", "date", "level", "group", "package", "sessions", "expires", "subscription"];
const VALID_SORT_DIRS: SortDir[] = ["asc", "desc"];

function AdminPlayersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [activityFilter, setActivityFilter] = useState(searchParams.get("activity") || "");
  const [subscriptionFilter, setSubscriptionFilter] = useState(searchParams.get("subscription") || "");
  const [levelFilter, setLevelFilter] = useState(searchParams.get("level") || "");
  const [packageFilter, setPackageFilter] = useState(searchParams.get("package") || "");
  const [groupFilter, setGroupFilter] = useState(searchParams.get("group") || "");
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [sortField, setSortField] = useState<SortField>(
    VALID_SORT_FIELDS.includes(searchParams.get("sort") as SortField) ? (searchParams.get("sort") as SortField) : "date"
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    VALID_SORT_DIRS.includes(searchParams.get("dir") as SortDir) ? (searchParams.get("dir") as SortDir) : "desc"
  );
  const [drawerPlayer, setDrawerPlayer] = useState<PlayerRow | null>(null);
  const [pageSize, setPageSize] = useState(Number(searchParams.get("size")) || 50);

  // Sync state to URL search params
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (activityFilter) params.set("activity", activityFilter);
    if (subscriptionFilter) params.set("subscription", subscriptionFilter);
    if (levelFilter) params.set("level", levelFilter);
    if (packageFilter) params.set("package", packageFilter);
    if (groupFilter) params.set("group", groupFilter);
    if (sortField !== "expires") params.set("sort", sortField);
    if (sortDir !== "desc") params.set("dir", sortDir);
    if (currentPage > 1) params.set("page", String(currentPage));
    if (pageSize !== 10) params.set("size", String(pageSize));
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  }, [search, activityFilter, subscriptionFilter, levelFilter, packageFilter, groupFilter, sortField, sortDir, currentPage, pageSize, pathname, router]);

  const { getRowId, isHighlighted } = useHighlightRow();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchPlayers = useCallback(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [{ data: profileData }, { data: attendanceData }, { data: groupPlayerData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, date_of_birth, area, playing_level, training_goals, health_conditions, height, weight, preferred_hand, preferred_position, guardian_name, guardian_phone, is_active, created_at, subscriptions(id, status, sessions_remaining, sessions_total, start_date, end_date, packages(name))")
        .eq("role", "player")
        .order("created_at", { ascending: false }),
      supabase
        .from("attendance")
        .select("player_id, session_date")
        .eq("status", "present")
        .gte("session_date", thirtyDaysAgo)
        .order("session_date", { ascending: false }),
      supabase
        .from("group_players")
        .select("player_id, groups(id, name)")
        .eq("is_active", true),
    ]);

    const lastAttendedMap: Record<string, string> = {};
    if (attendanceData) {
      for (const row of attendanceData) {
        if (!lastAttendedMap[row.player_id]) {
          lastAttendedMap[row.player_id] = row.session_date;
        }
      }
    }

    const playerGroupsMap: Record<string, { id: string; name: string }[]> = {};
    if (groupPlayerData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of groupPlayerData as any[]) {
        if (row.groups) {
          if (!playerGroupsMap[row.player_id]) playerGroupsMap[row.player_id] = [];
          playerGroupsMap[row.player_id].push(row.groups);
        }
      }
    }

    if (profileData) {
      const playersWithData = (profileData as unknown as PlayerRow[]).map((p) => ({
        ...p,
        last_attended: lastAttendedMap[p.id] || null,
        groups: playerGroupsMap[p.id] || [],
      }));
      setPlayers(playersWithData);
      // Keep drawer player in sync with refreshed data
      setDrawerPlayer((prev) => {
        if (!prev) return null;
        return playersWithData.find((p) => p.id === prev.id) || null;
      });
    }
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
        if (s.packages?.name && s.sessions_total > 1 && isEffectivelyActive(s)) names.add(s.packages.name);
      });
    });
    return Array.from(names).sort();
  }, [players]);

  // Unique group names for filter dropdown
  const groupNames = useMemo(() => {
    const names = new Set<string>();
    players.forEach((p) => {
      p.groups?.forEach((g) => names.add(g.name));
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
      if (activityFilter) {
        const selected = activityFilter.split(",").map((s) => s.toLowerCase());
        if (!selected.includes(getActivityStatus(p))) return false;
      }
      if (subscriptionFilter) {
        // Map display labels to status values
        const labelToStatus: Record<string, string> = { "no sub": "none" };
        const selected = subscriptionFilter.split(",").map((s) => {
          const lower = s.toLowerCase();
          return labelToStatus[lower] || lower;
        });
        if (!selected.includes(getSubscriptionStatus(p))) return false;
      }
      if (levelFilter) {
        const selected = levelFilter.split(",").map((s) => s.toLowerCase());
        if (!p.playing_level || !selected.includes(p.playing_level)) return false;
      }
      if (packageFilter) {
        const selected = packageFilter.split(",");
        const activePackages = p.subscriptions?.filter((s) => isEffectivelyActive(s) && s.sessions_total > 1).map((s) => s.packages?.name) || [];
        if (!activePackages.some((name) => name && selected.includes(name))) return false;
      }
      if (groupFilter) {
        const selected = groupFilter.split(",");
        const playerGroupNames = p.groups?.map((g) => g.name) || [];
        const hasNoGroup = !p.groups?.length;
        const matchesGroup = selected.some((s) =>
          s === "No Group" ? hasNoGroup : playerGroupNames.includes(s)
        );
        if (!matchesGroup) return false;
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
      } else if (sortField === "group") {
        const aGroup = a.groups?.[0]?.name ?? "";
        const bGroup = b.groups?.[0]?.name ?? "";
        cmp = aGroup.localeCompare(bGroup);
      } else if (sortField === "package") {
        const aActiveSubs = a.subscriptions?.filter((s) => isEffectivelyActive(s) && s.sessions_total > 1) || [];
        const bActiveSubs = b.subscriptions?.filter((s) => isEffectivelyActive(s) && s.sessions_total > 1) || [];
        const aName = aActiveSubs[0]?.packages?.name ?? "";
        const bName = bActiveSubs[0]?.packages?.name ?? "";
        cmp = aName.localeCompare(bName);
      } else if (sortField === "sessions") {
        const aActiveSubs = a.subscriptions?.filter((s) => isEffectivelyActive(s) && s.sessions_total > 1) || [];
        const bActiveSubs = b.subscriptions?.filter((s) => isEffectivelyActive(s) && s.sessions_total > 1) || [];
        const aSess = aActiveSubs.reduce((sum, s) => sum + s.sessions_remaining, 0) || -1;
        const bSess = bActiveSubs.reduce((sum, s) => sum + s.sessions_remaining, 0) || -1;
        cmp = aSess - bSess;
      } else if (sortField === "expires") {
        const aEnd = getLatestSubscription(a)?.end_date;
        const bEnd = getLatestSubscription(b)?.end_date;
        const aTime = aEnd ? new Date(aEnd).getTime() : 0;
        const bTime = bEnd ? new Date(bEnd).getTime() : 0;
        cmp = aTime - bTime;
      } else if (sortField === "subscription") {
        const subOrder: Record<string, number> = { active: 0, "expiring soon": 1, attended: 2, expired: 3, pending: 4, none: 5 };
        cmp = (subOrder[getSubscriptionStatus(a)] ?? 99) - (subOrder[getSubscriptionStatus(b)] ?? 99);
      } else if (sortField === "activity") {
        const aActive = getActivityStatus(a) === "active" ? 0 : 1;
        const bActive = getActivityStatus(b) === "active" ? 0 : 1;
        cmp = aActive - bActive;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [players, search, activityFilter, subscriptionFilter, levelFilter, packageFilter, groupFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredPlayers.length / pageSize);
  const paginatedPlayers = filteredPlayers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, activityFilter, subscriptionFilter, levelFilter, packageFilter, groupFilter]);

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

  const hasActiveFilters = !!search || !!activityFilter || !!subscriptionFilter || !!levelFilter || !!packageFilter || !!groupFilter;

  // Add to Group
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [addGroupSuccess, setAddGroupSuccess] = useState<string | null>(null);
  const groupDropdownRef = useRef<HTMLDivElement>(null);
  const [levelDropdownOpen, setLevelDropdownOpen] = useState(false);
  const [bulkLevelUpdating, setBulkLevelUpdating] = useState(false);
  const [bulkLevelSuccess, setBulkLevelSuccess] = useState<string | null>(null);
  const levelDropdownRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!levelDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (levelDropdownRef.current && !levelDropdownRef.current.contains(e.target as Node)) {
        setLevelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [levelDropdownOpen]);

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

  async function handleBulkLevel(level: string | null) {
    setBulkLevelUpdating(true);
    const ids = Array.from(selectedIds);
    const result = await bulkUpdatePlayerLevel(ids, level);
    if (result.error) {
      alert(result.error);
    } else {
      const label = level ? level.charAt(0).toUpperCase() + level.slice(1) : "None";
      setBulkLevelSuccess(`Updated ${ids.length} player${ids.length > 1 ? "s" : ""} to ${label}`);
      setPlayers((prev) =>
        prev.map((p) => (selectedIds.has(p.id) ? { ...p, playing_level: level } : p))
      );
      setSelectedIds(new Set());
      setTimeout(() => setBulkLevelSuccess(null), 3000);
    }
    setBulkLevelUpdating(false);
    setLevelDropdownOpen(false);
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
        activityFilter={activityFilter}
        onActivityFilterChange={setActivityFilter}
        subscriptionFilter={subscriptionFilter}
        onSubscriptionFilterChange={setSubscriptionFilter}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        packageFilter={packageFilter}
        onPackageFilterChange={setPackageFilter}
        packageOptions={packageNames}
        groupFilter={groupFilter}
        onGroupFilterChange={setGroupFilter}
        groupOptions={groupNames}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={toggleSort}
        onReset={() => { setSearch(""); setActivityFilter(""); setSubscriptionFilter(""); setLevelFilter(""); setPackageFilter(""); setGroupFilter(""); }}
        hasActiveFilters={hasActiveFilters}
      />

      <SelectionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <div className="relative" ref={groupDropdownRef}>
          <button
            onClick={() => setGroupDropdownOpen((o) => !o)}
            disabled={addingToGroup}
            className="inline-flex items-center gap-1 sm:gap-1.5 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <Users className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add to</span> Group
            <ChevronDown className="w-3 h-3" />
          </button>
          {groupDropdownOpen && (
            <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
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
        <div className="relative" ref={levelDropdownRef}>
          <button
            onClick={() => setLevelDropdownOpen((o) => !o)}
            disabled={bulkLevelUpdating}
            className="inline-flex items-center gap-1 sm:gap-1.5 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Level
            <ChevronDown className="w-3 h-3" />
          </button>
          {levelDropdownOpen && (
            <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
              {[
                { value: "beginner", label: "Beginner" },
                { value: "intermediate", label: "Intermediate" },
                { value: "advanced", label: "Advanced" },
                { value: "professional", label: "Professional" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleBulkLevel(opt.value)}
                  disabled={bulkLevelUpdating}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {bulkLevelUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-2" /> : null}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </SelectionBar>
      {(addGroupSuccess || bulkLevelSuccess) && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          <Check className="w-4 h-4" /> {addGroupSuccess || bulkLevelSuccess}
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
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />

      <PlayerDrawer
        player={drawerPlayer}
        onClose={() => setDrawerPlayer(null)}
        onDataChange={fetchPlayers}
      />
    </div>
  );
}
