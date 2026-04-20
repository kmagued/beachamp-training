"use client";

import { Suspense, useState, useEffect, useTransition, useMemo, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Badge, Pagination, SelectionBar, Toast } from "@/components/ui";
import { useHighlightRow } from "@/hooks/use-highlight-row";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { confirmPayment, rejectPayment, getScreenshotUrl, bulkUpdatePaymentStatus, bulkDeletePayments } from "./actions";
import type { PaymentRow, SortField, SortDir } from "./_components/types";
import { PaymentsPageSkeleton, PaymentsInlineSkeleton } from "./_components/skeleton";
import { PaymentsFilters } from "./_components/filters";
import { PaymentsTableView } from "./_components/table";
import { RejectModal, ConfirmDeleteDrawer, ScreenshotLightbox } from "./_components/modals";
import { PaymentDrawer } from "./_components/payment-drawer";
import { NewPaymentDrawer } from "./_components/new-payment-drawer";
import Link from "next/link";

export default function AdminPaymentsPage() {
  return (
    <Suspense fallback={<PaymentsPageSkeleton />}>
      <AdminPaymentsContent />
    </Suspense>
  );
}

const VALID_PAY_SORT_FIELDS: SortField[] = ["date", "amount", "status"];
const VALID_PAY_SORT_DIRS: SortDir[] = ["asc", "desc"];

function AdminPaymentsContent() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [drawerPayment, setDrawerPayment] = useState<PaymentRow | null>(null);
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const handleToastClose = useCallback(() => setToast(null), []);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialStatusParam = searchParams.get("status");

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("statusFilter")
      || (initialStatusParam ? initialStatusParam.charAt(0).toUpperCase() + initialStatusParam.slice(1) : "")
  );
  const [packageFilter, setPackageFilter] = useState(searchParams.get("package") || "");
  const [monthFilter, setMonthFilter] = useState(searchParams.get("month") || "");
  const [methodFilter, setMethodFilter] = useState(searchParams.get("method") || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "");
  const [sortField, setSortField] = useState<SortField>(
    VALID_PAY_SORT_FIELDS.includes(searchParams.get("sort") as SortField) ? (searchParams.get("sort") as SortField) : "date"
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    VALID_PAY_SORT_DIRS.includes(searchParams.get("dir") as SortDir) ? (searchParams.get("dir") as SortDir) : "desc"
  );
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSize] = useState(Number(searchParams.get("size")) || 10);

  // Sync state to URL search params
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("statusFilter", statusFilter);
    if (packageFilter) params.set("package", packageFilter);
    if (monthFilter) params.set("month", monthFilter);
    if (methodFilter) params.set("method", methodFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (sortField !== "date") params.set("sort", sortField);
    if (sortDir !== "desc") params.set("dir", sortDir);
    if (currentPage > 1) params.set("page", String(currentPage));
    if (pageSize !== 10) params.set("size", String(pageSize));
    // Preserve highlight param if present
    const highlight = searchParams.get("highlight");
    if (highlight) params.set("highlight", highlight);
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  }, [search, statusFilter, methodFilter, packageFilter, monthFilter, typeFilter, sortField, sortDir, currentPage, pageSize, pathname, router, searchParams]);

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
      .select("*, profiles!payments_player_id_fkey(first_name, last_name), subscriptions!payments_subscription_id_fkey(start_date, end_date, packages(name))")
      .order("created_at", { ascending: false })
      .limit(5000);
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

  function getPaymentDate(p: PaymentRow): Date | null {
    if (p.confirmed_at) return new Date(p.confirmed_at);
    return null;
  }

  // Derive unique months from payments (sorted newest first)
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    payments.forEach((p) => {
      const d = getPaymentDate(p);
      if (!d) return;
      months.add(d.toLocaleDateString("en-US", { year: "numeric", month: "long" }));
    });
    return [...months].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments]);

  // Filtered + sorted payments
  const filteredPayments = useMemo(() => {
    let result = payments;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => {
        const name = `${p.profiles?.first_name ?? ""} ${p.profiles?.last_name ?? ""}`.toLowerCase();
        const note = (p.note ?? "").toLowerCase();
        return name.includes(q) || note.includes(q);
      });
    }

    if (monthFilter) {
      result = result.filter((p) => {
        const d = getPaymentDate(p);
        if (!d) return false;
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long" }) === monthFilter;
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

    if (methodFilter) {
      const selected = methodFilter.split(",").map((s) => s.toLowerCase());
      result = result.filter((p) => selected.includes(p.method?.toLowerCase()));
    }

    if (typeFilter) {
      if (typeFilter === "player") result = result.filter((p) => p.profiles !== null);
      if (typeFilter === "quick") result = result.filter((p) => p.profiles === null);
    }

    const statusOrder: Record<string, number> = { pending: 0, confirmed: 1, rejected: 2 };

    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        const aDate = a.confirmed_at ? new Date(a.confirmed_at).getTime() : 0;
        const bDate = b.confirmed_at ? new Date(b.confirmed_at).getTime() : 0;
        cmp = aDate - bDate;
      } else if (sortField === "amount") {
        cmp = a.amount - b.amount;
      } else {
        cmp = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [payments, search, monthFilter, statusFilter, methodFilter, packageFilter, typeFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredPayments.length / pageSize);
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, monthFilter, statusFilter, methodFilter, packageFilter, typeFilter]);

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
      const res = await confirmPayment(id);
      setActionId(null);
      if ("error" in res) {
        setToast({ message: res.error ?? "Failed to confirm payment", variant: "error" });
      } else {
        setToast({ message: "Payment confirmed", variant: "success" });
      }
      fetchPayments();
    });
  }

  function handleReject(id: string) {
    if (!rejectReason.trim() || isPending) return;
    setActionId(id);
    startTransition(async () => {
      const res = await rejectPayment(id, rejectReason);
      setActionId(null);
      setRejectingId(null);
      setRejectReason("");
      if ("error" in res) {
        setToast({ message: res.error ?? "Failed to reject payment", variant: "error" });
      } else {
        setToast({ message: "Payment rejected", variant: "success" });
      }
      fetchPayments();
    });
  }

  function handleBulkStatus(status: string) {
    if (isPending || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    startTransition(async () => {
      const res = await bulkUpdatePaymentStatus(ids, status);
      setSelectedIds(new Set());
      if ("error" in res) {
        setToast({ message: res.error ?? "Failed to update payments", variant: "error" });
      } else {
        setToast({ message: `${ids.length} payment(s) updated to ${status}`, variant: "success" });
      }
      fetchPayments();
    });
  }

  function handleBulkDelete() {
    if (isPending || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    startTransition(async () => {
      const res = await bulkDeletePayments(ids);
      setSelectedIds(new Set());
      setConfirmDelete(false);
      if ("error" in res) {
        setToast({ message: res.error ?? "Failed to delete payments", variant: "error" });
      } else {
        setToast({ message: `${ids.length} payment(s) deleted`, variant: "success" });
      }
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
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={handleToastClose} />
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Payments</h1>
          <p className="text-slate-500 text-sm">
            {payments.length} total payments
            {(!!search || !!monthFilter || !!statusFilter || !!methodFilter || !!packageFilter || !!typeFilter) && ` · ${filteredPayments.length} matching`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={async () => {
              const { exportToExcel } = await import("@/lib/utils/export-excel");
              const rows = filteredPayments.map((p) => ({
                Date: p.confirmed_at ? new Date(p.confirmed_at).toISOString().split("T")[0] : "",
                Player: `${p.profiles?.first_name || ""} ${p.profiles?.last_name || ""}`.trim(),
                Package: p.subscriptions?.packages?.name || "",
                "Amount (EGP)": p.amount,
                Method: p.method,
                Status: p.status,
              }));
              const dateStr = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
              exportToExcel(rows, `payments-${dateStr.replace(/\s/g, "-").toLowerCase()}`, "Payments");
            }}
            disabled={filteredPayments.length === 0}
            title="Export to Excel"
            aria-label="Export to Excel"
            className="p-2 sm:px-3 sm:py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
          <Link
            href="/admin/payments/import"
            className="p-2 sm:px-4 sm:py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors inline-flex items-center"
            title="Import"
            aria-label="Import"
          >
            <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4m0 0l-4 4m4-4v12" />
            </svg>
            <span className="hidden sm:inline">Import</span>
          </Link>
          <button
            onClick={() => setShowNewPayment(true)}
            className="px-3 sm:px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            + New<span className="hidden sm:inline"> Payment</span>
          </button>
        </div>
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
        methodFilter={methodFilter}
        onMethodFilterChange={setMethodFilter}
        packageFilter={packageFilter}
        onPackageFilterChange={setPackageFilter}
        packageOptions={packageOptions}
        monthFilter={monthFilter}
        onMonthFilterChange={setMonthFilter}
        monthOptions={monthOptions}
        sortField={sortField}
        sortDir={sortDir}
        onSortChange={toggleSort}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        onReset={() => { setSearch(""); setMonthFilter(""); setStatusFilter(""); setMethodFilter(""); setPackageFilter(""); setTypeFilter(""); }}
        hasActiveFilters={!!search || !!monthFilter || !!statusFilter || !!methodFilter || !!packageFilter || !!typeFilter}
      />

      <SelectionBar count={selectedIds.size} onClear={() => { setSelectedIds(new Set()); setConfirmDelete(false); }}>
        <button
          onClick={() => handleBulkStatus("confirmed")}
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
        >
          {isPending ? "Updating..." : "Confirm All"}
        </button>
        <button
          onClick={() => handleBulkStatus("rejected")}
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
        >
          Reject All
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          Delete All
        </button>
      </SelectionBar>

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
            onRowClick={setDrawerPayment}
            search={search}
            statusFilter={statusFilter}
            grandTotal={filteredPayments.reduce((sum, p) => sum + p.amount, 0)}
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

      <RejectModal
        rejectingId={rejectingId}
        rejectReason={rejectReason}
        onReasonChange={setRejectReason}
        onReject={() => rejectingId && handleReject(rejectingId)}
        onCancel={() => { setRejectingId(null); setRejectReason(""); }}
        isPending={isPending}
        actionId={actionId}
      />

      <ConfirmDeleteDrawer
        open={confirmDelete}
        payments={payments.filter((p) => selectedIds.has(p.id))}
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmDelete(false)}
        isPending={isPending}
      />

      <ScreenshotLightbox
        url={screenshotUrl}
        onClose={() => setScreenshotUrl(null)}
      />

      <PaymentDrawer
        payment={drawerPayment}
        onClose={() => setDrawerPayment(null)}
        onConfirm={(id) => { setDrawerPayment(null); handleConfirm(id); }}
        onReject={(id) => { setDrawerPayment(null); setRejectingId(id); }}
        onViewScreenshot={handleViewScreenshot}
        onDataChange={() => { setDrawerPayment(null); setToast({ message: "Payment updated", variant: "success" }); fetchPayments(); }}
        isPending={isPending}
        actionId={actionId}
      />

      <NewPaymentDrawer
        open={showNewPayment}
        onClose={() => setShowNewPayment(false)}
        onSuccess={() => { setToast({ message: "Payment created successfully", variant: "success" }); fetchPayments(); }}
      />
    </div>
  );
}
