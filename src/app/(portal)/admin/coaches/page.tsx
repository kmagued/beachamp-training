"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Pagination, SelectionBar } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import type { CoachRow, SortField, SortDir } from "./_components/types";
import { CoachesPageSkeleton, CoachesInlineSkeleton } from "./_components/skeleton";
import { CoachesFilters } from "./_components/filters";
import { CoachesTableView } from "./_components/table";

export default function AdminCoachesPage() {
  return (
    <Suspense fallback={<CoachesPageSkeleton />}>
      <AdminCoachesContent />
    </Suspense>
  );
}

function AdminCoachesContent() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const PAGE_SIZE = 10;

  const { getRowId, isHighlighted } = useHighlightRow();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, area, is_active, created_at")
        .eq("role", "coach")
        .order("created_at", { ascending: false });
      if (data) setCoaches(data as CoachRow[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCoaches = useMemo(() => {
    const result = coaches.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
        const matchesSearch =
          fullName.includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      if (statusFilter) {
        const selected = statusFilter.split(",").map((s) => s.toLowerCase());
        const status = c.is_active ? "active" : "inactive";
        if (!selected.includes(status)) return false;
      }
      return true;
    });

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [coaches, search, statusFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredCoaches.length / PAGE_SIZE);
  const paginatedCoaches = filteredCoaches.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const pageIds = paginatedCoaches.map((c) => c.id);
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

  const hasActiveFilters = !!search || !!statusFilter;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Coaches</h1>
        <p className="text-slate-500 text-sm">
          {coaches.length} total coaches
          {hasActiveFilters && ` · ${filteredCoaches.length} matching`}
        </p>
      </div>

      <CoachesFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onReset={() => { setSearch(""); setStatusFilter(""); }}
        hasActiveFilters={hasActiveFilters}
      />

      <SelectionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />

      <div className="flex-1">
        {loading ? (
          <CoachesInlineSkeleton />
        ) : (
          <CoachesTableView
            coaches={paginatedCoaches}
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
          />
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
