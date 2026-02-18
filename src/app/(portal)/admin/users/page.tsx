"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Pagination, SelectionBar } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import type { UserRow, SortField, SortDir } from "./_components/types";
import type { UserRole } from "@/types/database";
import { UsersPageSkeleton, UsersInlineSkeleton } from "./_components/skeleton";
import { UsersFilters } from "./_components/filters";
import { UsersTableView } from "./_components/table";
import { updateUserRole } from "./actions";

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<UsersPageSkeleton />}>
      <AdminUsersContent />
    </Suspense>
  );
}

function AdminUsersContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const PAGE_SIZE = 10;

  const { getRowId, isHighlighted } = useHighlightRow();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      const [{ data: { user } }, { data }] = await Promise.all([
        supabase.auth.getUser(),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, email, phone, area, role, is_active, created_at")
          .order("created_at", { ascending: false }),
      ]);
      if (user) setCurrentUserId(user.id);
      if (data) setUsers(data as UserRow[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRoleChange = useCallback(async (userId: string, newRole: UserRole) => {
    setChangingRoleId(userId);
    const result = await updateUserRole(userId, newRole);
    if (result.error) {
      alert(result.error);
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    }
    setChangingRoleId(null);
  }, []);

  const filteredUsers = useMemo(() => {
    const result = users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
        const matchesSearch =
          fullName.includes(q) ||
          (u.email?.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      if (roleFilter) {
        const selected = roleFilter.split(",").map((s) => s.toLowerCase());
        if (!selected.includes(u.role)) return false;
      }
      if (statusFilter) {
        const selected = statusFilter.split(",").map((s) => s.toLowerCase());
        const status = u.is_active ? "active" : "inactive";
        if (!selected.includes(status)) return false;
      }
      return true;
    });

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") {
        cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
      } else if (sortField === "role") {
        cmp = a.role.localeCompare(b.role);
      } else {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, search, roleFilter, statusFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, statusFilter]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const pageIds = paginatedUsers.map((u) => u.id);
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

  const hasActiveFilters = !!search || !!roleFilter || !!statusFilter;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">User Management</h1>
        <p className="text-slate-500 text-sm">
          {users.length} total users
          {hasActiveFilters && ` · ${filteredUsers.length} matching`}
        </p>
      </div>

      <UsersFilters
        search={search}
        onSearchChange={setSearch}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onReset={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); }}
        hasActiveFilters={hasActiveFilters}
      />

      <SelectionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />

      <div className="flex-1">
        {loading ? (
          <UsersInlineSkeleton />
        ) : (
          <UsersTableView
            users={paginatedUsers}
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
            onRoleChange={handleRoleChange}
            changingRoleId={changingRoleId}
            currentUserId={currentUserId}
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
