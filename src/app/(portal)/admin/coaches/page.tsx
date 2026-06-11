"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { createBrowserClient } from "@supabase/ssr";
import { Pagination, SelectionBar, Button, Input, Drawer } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { createCoach, bulkDeleteCoaches } from "@/app/_actions/training";
import { Plus, Eye, EyeOff, Copy, CheckCircle2, Trash2, Loader2 } from "lucide-react";
import type { CoachRow, SortField, SortDir } from "./_components/types";
import { CoachesPageSkeleton, CoachesInlineSkeleton } from "./_components/skeleton";
import { CoachesFilters } from "./_components/filters";
import { CoachesTableView } from "./_components/table";
import { CoachDrawer } from "./_components/coach-drawer";

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

  // Add Coach state
  const [showAddCoach, setShowAddCoach] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const { getRowId, isHighlighted } = useHighlightRow();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchCoaches = useCallback(async () => {
    // Single nested-select query — coaches with their group assignments
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, area, is_active, created_at, coach_groups!coach_groups_coach_id_fkey(is_active, groups(name))")
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
        };
      }) as CoachRow[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchCoaches();
  }, [fetchCoaches]);

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

  function handleAddCoach(formData: FormData) {
    setAddError(null);
    startTransition(async () => {
      const result = await createCoach(formData);
      if ("error" in result) {
        setAddError((result as { error: string }).error);
      } else {
        setCreatedPassword((result as { password?: string }).password || null);
        fetchCoaches();
      }
    });
  }

  function copyPassword() {
    if (createdPassword) {
      navigator.clipboard.writeText(createdPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

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
        <Button size="sm" onClick={() => { setShowAddCoach(true); setAddError(null); setCreatedPassword(null); }}>
          <span className="flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Add Coach
          </span>
        </Button>
      </div>

      {/* Add Coach Drawer */}
      <Drawer
        open={showAddCoach}
        onClose={() => { setShowAddCoach(false); setCreatedPassword(null); }}
        title={createdPassword ? "Coach Created!" : "Add New Coach"}
        footer={
          createdPassword ? (
            <Button fullWidth onClick={() => { setShowAddCoach(false); setCreatedPassword(null); }}>Done</Button>
          ) : (
            <Button type="submit" form="add-coach-form" fullWidth disabled={isPending}>
              {isPending ? "Creating..." : "Create Coach Account"}
            </Button>
          )
        }
      >
        {createdPassword ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-sm font-medium text-emerald-700">Coach account created successfully</p>
            </div>
            <p className="text-xs text-emerald-600 mb-3">Share this temporary password with the coach.</p>
            <div className="flex items-center gap-2 bg-white rounded-lg border border-emerald-200 px-3 py-2">
              <code className="flex-1 text-sm font-mono text-slate-900">
                {showPassword ? createdPassword : "••••••••••••"}
              </code>
              <button onClick={() => setShowPassword(!showPassword)} className="text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button onClick={copyPassword} className="text-slate-400 hover:text-slate-600">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <form id="add-coach-form" action={handleAddCoach} className="space-y-3">
            {addError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{addError}</div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">First Name</label>
                <Input name="first_name" required placeholder="John" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Last Name</label>
                <Input name="last_name" required placeholder="Doe" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
              <Input name="email" type="email" required placeholder="coach@example.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Phone</label>
              <Input name="phone" placeholder="+201234567890" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Password</label>
              <Input name="password" type="text" required placeholder="Temporary password" defaultValue={Math.random().toString(36).slice(-10)} />
              <p className="text-[10px] text-slate-400 mt-1">Coach should change this after first login</p>
            </div>
          </form>
        )}
      </Drawer>

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
                Their accounts are removed, any sessions they ran become unassigned, and their feedback is deleted. Admin accounts are skipped. This can&apos;t be undone.
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
                        ? `${failed} coach${failed === 1 ? "" : "es"} couldn't be deleted (admin accounts are skipped).`
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
