"use client";

import { Suspense, useState, useEffect, useTransition, useMemo, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Badge, Pagination, SelectionBar } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { useSearchParams } from "next/navigation";
import { confirmPayment, rejectPayment, getScreenshotUrl } from "./actions";
import type { PaymentRow, SortField, SortDir } from "./_components/types";
import { PaymentsPageSkeleton, PaymentsInlineSkeleton } from "./_components/skeleton";
import { PaymentsFilters } from "./_components/filters";
import { PaymentsTableView } from "./_components/table";
import { RejectModal, ScreenshotLightbox } from "./_components/modals";

export default function AdminPaymentsPage() {
  return (
    <Suspense fallback={<PaymentsPageSkeleton />}>
      <AdminPaymentsContent />
    </Suspense>
  );
}

function AdminPaymentsContent() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const initialStatusParam = searchParams.get("status");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    initialStatusParam
      ? initialStatusParam.charAt(0).toUpperCase() + initialStatusParam.slice(1)
      : ""
  );
  const [packageFilter, setPackageFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);
  const { getRowId, isHighlighted } = useHighlightRow();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function fetchPayments() {
    const { data } = await supabase
      .from("payments")
      .select("*, profiles!payments_player_id_fkey(first_name, last_name), subscriptions!payments_subscription_id_fkey(packages(name))")
      .order("created_at", { ascending: false });
    if (data) setPayments(data as unknown as PaymentRow[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive unique package names for filter
  const packageOptions = useMemo(() => {
    const names = new Set<string>();
    payments.forEach((p) => {
      if (p.subscriptions?.packages?.name) names.add(p.subscriptions.packages.name);
    });
    return [...names].sort();
  }, [payments]);

  // Filtered + sorted payments
  const filteredPayments = useMemo(() => {
    let result = payments;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => {
        const name = `${p.profiles?.first_name ?? ""} ${p.profiles?.last_name ?? ""}`.toLowerCase();
        return name.includes(q);
      });
    }

    if (statusFilter) {
      const selected = statusFilter.split(",").map((s) => s.toLowerCase());
      result = result.filter((p) => selected.includes(p.status));
    }

    if (packageFilter) {
      const selected = packageFilter.split(",");
      result = result.filter((p) => selected.includes(p.subscriptions?.packages?.name ?? ""));
    }

    const statusOrder: Record<string, number> = { pending: 0, confirmed: 1, rejected: 2 };

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === "amount") {
        cmp = a.amount - b.amount;
      } else {
        cmp = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [payments, search, statusFilter, packageFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredPayments.length / PAGE_SIZE);
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, packageFilter]);

  // Selection helpers
  const pageIds = paginatedPayments.map((p) => p.id);
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
      setSortDir("desc");
    }
  }

  function handleConfirm(id: string) {
    if (isPending) return;
    setActionId(id);
    startTransition(async () => {
      await confirmPayment(id);
      setActionId(null);
      fetchPayments();
    });
  }

  function handleReject(id: string) {
    if (!rejectReason.trim() || isPending) return;
    setActionId(id);
    startTransition(async () => {
      await rejectPayment(id, rejectReason);
      setActionId(null);
      setRejectingId(null);
      setRejectReason("");
      fetchPayments();
    });
  }

  async function handleViewScreenshot(path: string) {
    const result = await getScreenshotUrl(path);
    if (result.url) setScreenshotUrl(result.url);
  }

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const confirmedToday = payments.filter(
    (p) =>
      p.status === "confirmed" &&
      p.confirmed_at &&
      new Date(p.confirmed_at).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto flex flex-col min-h-[calc(100vh-3.5rem)] md:min-h-screen">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Payments</h1>
        <p className="text-slate-500 text-sm">
          {payments.length} total payments
          {(!!search || !!statusFilter || !!packageFilter) && ` · ${filteredPayments.length} matching`}
        </p>
      </div>

      <div className="flex gap-3 mb-6">
        <Badge variant={pendingCount > 0 ? "warning" : "neutral"}>
          {pendingCount} Pending
        </Badge>
        <Badge variant="success">{confirmedToday} Confirmed Today</Badge>
      </div>

      <PaymentsFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        packageFilter={packageFilter}
        onPackageFilterChange={setPackageFilter}
        packageOptions={packageOptions}
        onReset={() => { setSearch(""); setStatusFilter(""); setPackageFilter(""); }}
        hasActiveFilters={!!search || !!statusFilter || !!packageFilter}
      />

      <SelectionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} />

      <div className="flex-1">
        {loading ? (
          <PaymentsInlineSkeleton />
        ) : (
          <PaymentsTableView
            payments={paginatedPayments}
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
            onConfirm={handleConfirm}
            onReject={(id) => setRejectingId(id)}
            isPending={isPending}
            actionId={actionId}
            onViewScreenshot={handleViewScreenshot}
            search={search}
            statusFilter={statusFilter}
          />
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />

      <RejectModal
        rejectingId={rejectingId}
        rejectReason={rejectReason}
        onReasonChange={setRejectReason}
        onReject={() => rejectingId && handleReject(rejectingId)}
        onCancel={() => { setRejectingId(null); setRejectReason(""); }}
        isPending={isPending}
        actionId={actionId}
      />

      <ScreenshotLightbox
        url={screenshotUrl}
        onClose={() => setScreenshotUrl(null)}
      />
    </div>
  );
}
