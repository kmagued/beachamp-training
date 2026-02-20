"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Pagination, SelectionBar, Card, Button, Input } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { createCoach } from "@/app/_actions/training";
import { Plus, X, Eye, EyeOff, Copy, CheckCircle2 } from "lucide-react";
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
    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, area, is_active, created_at")
      .eq("role", "coach")
      .order("created_at", { ascending: false });

    if (data) {
      // Get group assignments for each coach
      const coachIds = data.map((c: { id: string }) => c.id);
      const { data: assignments } = await supabase
        .from("coach_groups")
        .select("coach_id, group_id, groups(name)")
        .in("coach_id", coachIds)
        .eq("is_active", true);

      const groupMap = new Map<string, string[]>();
      if (assignments) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of assignments as any[]) {
          const existing = groupMap.get(a.coach_id) || [];
          existing.push(a.groups?.name || "Unknown");
          groupMap.set(a.coach_id, existing);
        }
      }

      setCoaches(data.map((c: { id: string }) => ({
        ...c,
        group_count: (groupMap.get(c.id) || []).length,
        group_names: groupMap.get(c.id) || [],
      })) as CoachRow[]);
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Coaches</h1>
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

      {/* Add Coach Modal */}
      {showAddCoach && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">
                {createdPassword ? "Coach Created!" : "Add New Coach"}
              </h3>
              <button onClick={() => { setShowAddCoach(false); setCreatedPassword(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            {createdPassword ? (
              <div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
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
                <Button fullWidth onClick={() => { setShowAddCoach(false); setCreatedPassword(null); }}>Done</Button>
              </div>
            ) : (
              <form action={handleAddCoach} className="space-y-3">
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
                <Button type="submit" fullWidth disabled={isPending}>
                  {isPending ? "Creating..." : "Create Coach Account"}
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}

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
