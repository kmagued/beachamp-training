"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { createBrowserClient } from "@supabase/ssr";
import { Pagination, SelectionBar, Button, Toast } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { bulkDeleteCoaches } from "@/app/_actions/training";
import { Plus, Trash2, Loader2, Download } from "lucide-react";
import type { CoachRow, SortField, SortDir, InviteRow } from "./_components/types";
import { CoachesPageSkeleton, CoachesInlineSkeleton } from "./_components/skeleton";
import { CoachesFilters } from "./_components/filters";
import { CoachesTableView } from "./_components/table";
import { CoachDrawer } from "./_components/coach-drawer";
import { ExportPayDrawer } from "./_components/export-pay-drawer";
import { PendingInvites } from "./_components/pending-invites";
import { AddCoachDrawer } from "./_components/add-coach-drawer";

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
  const [pageSize, setPageSize] = useState(10);
  const [drawerCoach, setDrawerCoach] = useState<CoachRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, startBulkDeleteTransition] = useTransition();
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);

  // Add Coach
  const [showAddCoach, setShowAddCoach] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const { getRowId, isHighlighted } = useHighlightRow();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchCoaches = useCallback(async () => {
    // Single nested-select query — coaches with their group assignments
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, area, is_active, created_at, role, coach_groups!coach_groups_coach_id_fkey(is_active, groups(name))")
      .eq("is_coach", true)
      .order("created_at", { ascending: false });

    if (data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCoaches((data as any[]).map((c) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeAssignments = (c.coach_groups || []).filter((cg: any) => cg.is_active);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const group_names = activeAssignments.map((cg: any) => cg.groups?.name || "Unknown");
        return {
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone,
          area: c.area,
          is_active: c.is_active,
          created_at: c.created_at,
          group_count: group_names.length,
          group_names,
          is_player: c.role === "player",
        };
      }) as CoachRow[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

  // Open invites: not accepted, not revoked (expired ones stay until removed)
  const fetchInvites = useCallback(async () => {
    const { data } = await supabase
      .from("coach_invites")
      .select("id, token, first_name, last_name, phone, email, created_at, expires_at, accepted_at, revoked_at")
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    setInvites((data ?? []) as InviteRow[]);
  }, [supabase]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

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
  const totalPages = Math.ceil(filteredCoaches.length / pageSize);
  const paginatedCoaches = filteredCoaches.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
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

  // Selected coaches for the pay export, across every page, in name order
  const exportCoaches = useMemo(
    () =>
      coaches
        .filter((c) => selectedIds.has(c.id))
        .map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [coaches, selectedIds]
  );

  // Keep an open coach drawer in sync with refreshed list data; close it if the
  // coach is gone (e.g. after a delete), matching the players pattern.
  useEffect(() => {
    setDrawerCoach((prev) => (prev ? coaches.find((c) => c.id === prev.id) ?? null : prev));
  }, [coaches]);

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Coaches</h1>
          <p className="text-slate-500 text-sm">
            {coaches.length} total coaches
            {hasActiveFilters && ` · ${filteredCoaches.length} matching`}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddCoach(true)}>
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Add Coach
          </span>
        </Button>
      </div>

      <Toast message={toast} variant="success" onClose={clearToast} />

      <AddCoachDrawer
        open={showAddCoach}
        onClose={() => setShowAddCoach(false)}
        onAssigned={(name) => {
          setShowAddCoach(false);
          fetchCoaches();
          setToast(`${name} is now a coach. They'll see the Coach view next time they open the app.`);
        }}
        onInvited={fetchInvites}
      />

      <PendingInvites invites={invites} onChange={fetchInvites} />

      <CoachesFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onReset={() => { setSearch(""); setStatusFilter(""); }}
        hasActiveFilters={hasActiveFilters}
      />

      <SelectionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <button
          onClick={() => setShowExport(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <button
          onClick={() => setConfirmBulkDelete(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </SelectionBar>
      {bulkNotice && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <span>{bulkNotice}</span>
          <button onClick={() => setBulkNotice(null)} className="ml-auto text-xs font-medium text-amber-500 hover:text-amber-700">Dismiss</button>
        </div>
      )}

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
            onCoachClick={setDrawerCoach}
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

      <CoachDrawer
        coach={drawerCoach}
        onClose={() => setDrawerCoach(null)}
        onDataChange={fetchCoaches}
      />

      <ExportPayDrawer open={showExport} onClose={() => setShowExport(false)} coaches={exportCoaches} />

      {/* Bulk delete confirmation — portaled to body so the backdrop covers the whole viewport */}
      {confirmBulkDelete && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Delete {selectedIds.size} coach{selectedIds.size === 1 ? "" : "es"}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Their accounts are removed, any sessions they ran become unassigned, and their feedback is deleted. Admin and player accounts are skipped. This can&apos;t be undone.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting}>
                Cancel
              </Button>
              <button
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  startBulkDeleteTransition(async () => {
                    const res = await bulkDeleteCoaches(ids);
                    const failed = "results" in res ? res.results.failed : ids.length;
                    setSelectedIds(new Set());
                    setConfirmBulkDelete(false);
                    fetchCoaches();
                    setBulkNotice(
                      failed > 0
                        ? `${failed} coach${failed === 1 ? "" : "es"} couldn't be deleted (admin and player accounts are skipped).`
                        : null
                    );
                  });
                }}
                disabled={bulkDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {bulkDeleting ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</span>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
