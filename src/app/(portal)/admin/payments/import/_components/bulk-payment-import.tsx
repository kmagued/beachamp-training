"use client";

import { useState, useTransition, useRef, useCallback, useMemo, useEffect } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { Upload, Download, Loader2, AlertCircle, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { importBulkPayments, checkImportEmails, getPackageMap } from "../actions";
import type { PaymentImportRow, PaymentImportResult, PackageInfo } from "./types";

const HEADERS = ["email", "date", "amount", "package", "method"] as const;

const SORTABLE_KEYS = ["email", "date", "amount", "package", "method", "status"] as const;
type SortKey = (typeof SORTABLE_KEYS)[number];
type StatusFilter = "all" | "valid" | "error";
type SortDir = "asc" | "desc";

interface PreviewRow {
  index: number;
  data: Record<string, string>;
  error?: string;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    // Handle quoted values with commas inside
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

export function BulkPaymentImport() {
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [results, setResults] = useState<PaymentImportResult[] | null>(null);
  const [headerError, setHeaderError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [checking, setChecking] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 10;

  useEffect(() => {
    getPackageMap().then(setPackages);
  }, []);

  function validateRow(
    data: Record<string, string>,
    emailMap: Record<string, string>,
    pkgSet: Set<string>
  ): string | undefined {
    if (!data.email) return "Missing email";
    if (!data.date) return "Missing date";
    if (!data.amount || isNaN(Number(data.amount)) || Number(data.amount) <= 0) return "Invalid amount";
    if (!data.package) return "Missing package";
    if (!data.method) return "Missing method";

    const email = data.email.toLowerCase();
    if (!emailMap[email]) return "Player not found";
    if (!pkgSet.has(data.package.toLowerCase())) return "Package not found";

    const method = data.method.toLowerCase();
    if (!method.includes("cash") && !method.includes("instapay")) return "Invalid method (cash/instapay)";

    // Validate date
    const parsed = new Date(data.date);
    if (isNaN(parsed.getTime())) return "Invalid date";

    return undefined;
  }

  const filteredAndSortedPreview = useMemo(() => {
    if (!preview) return preview;

    let rows = preview;
    if (statusFilter === "valid") rows = rows.filter((r) => !r.error);
    else if (statusFilter === "error") rows = rows.filter((r) => !!r.error);

    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      if (sortKey === "amount") {
        aVal = Number(a.data.amount) || 0;
        bVal = Number(b.data.amount) || 0;
      } else if (sortKey === "status") {
        aVal = a.error ? 1 : 0;
        bVal = b.error ? 1 : 0;
      } else {
        aVal = (a.data[sortKey] || "").toLowerCase();
        bVal = (b.data[sortKey] || "").toLowerCase();
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [preview, sortKey, sortDir, statusFilter]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function SortIcon({ columnKey }: { columnKey: SortKey }) {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />;
  }

  async function processFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setHeaderError("Please upload a .csv file");
      return;
    }
    setResults(null);
    setHeaderError("");

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      setHeaderError("CSV is empty or has no data rows");
      setPreview(null);
      return;
    }

    const firstRow = rows[0];
    const missingHeaders = HEADERS.filter((h) => !(h in firstRow));
    if (missingHeaders.length > 0) {
      setHeaderError(`Missing columns: ${missingHeaders.join(", ")}`);
      setPreview(null);
      return;
    }

    setChecking(true);

    // Pre-fetch data for validation
    const emails = [...new Set(rows.map((r) => r.email).filter(Boolean))];
    const emailMap = await checkImportEmails(emails);
    const pkgList = packages.length > 0 ? packages : await getPackageMap();
    const pkgSet = new Set(pkgList.map((p) => p.name.toLowerCase()));

    setChecking(false);

    const previewRows: PreviewRow[] = rows.map((data, i) => {
      const error = validateRow(data, emailMap, pkgSet);
      return { index: i, data, error };
    });

    setPreview(previewRows);
    setPage(0);
    setSortKey(null);
    setStatusFilter("all");
    const validIndices = new Set(previewRows.filter((r) => !r.error).map((r) => r.index));
    setSelected(validIndices);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!preview) return;
    const selectableIndices = preview.filter((r) => !r.error).map((r) => r.index);
    if (selected.size === selectableIndices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIndices));
    }
  }

  function handleImport() {
    if (!preview) return;
    const selectedRows = preview.filter((r) => selected.has(r.index) && !r.error);
    if (selectedRows.length === 0) return;

    const importRows: PaymentImportRow[] = selectedRows.map((r) => ({
      email: r.data.email,
      date: r.data.date,
      amount: Number(r.data.amount),
      package: r.data.package,
      method: r.data.method,
    }));

    startTransition(async () => {
      const res = await importBulkPayments(importRows);
      setResults(res);
      setPreview(null);
    });
  }

  function downloadResults() {
    if (!results) return;
    const header = "email,package,amount,status,error\n";
    const rows = results.map((r) =>
      `"${r.email}","${r.package}",${r.amount},"${r.status}","${r.error || ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-import-results-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const headers = HEADERS.join(",");
    const example = "player@email.com,2025-10-01,1000,8 Sessions,cash";
    const blob = new Blob([headers + "\n" + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setPreview(null);
    setResults(null);
    setHeaderError("");
    setSelected(new Set());
    setPage(0);
    setSortKey(null);
    setStatusFilter("all");
    if (fileRef.current) fileRef.current.value = "";
  }

  const displayRows = filteredAndSortedPreview ?? preview;
  const selectedCount = selected.size;
  const errorCount = preview?.filter((r) => r.error).length ?? 0;
  const totalPages = displayRows ? Math.ceil(displayRows.length / PAGE_SIZE) : 0;
  const paginatedPreview = displayRows?.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const allValidIndices = preview?.filter((r) => !r.error).map((r) => r.index) ?? [];
  const allSelected = allValidIndices.length > 0 && selected.size === allValidIndices.length;

  const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2 whitespace-nowrap";

  return (
    <div className="space-y-4">
      {/* Available Packages */}
      {!preview && !results && !checking && packages.length > 0 && (
        <Card className="p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Available Packages</h3>
          <div className="flex flex-wrap gap-2">
            {packages.map((pkg) => (
              <span key={pkg.id} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                {pkg.name}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Upload Area */}
      {!preview && !results && !checking && (
        <Card className="p-0">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "relative text-center py-10 px-6 m-4 rounded-xl border-2 border-dashed transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-slate-200 hover:border-slate-300"
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className={cn("w-10 h-10 mx-auto mb-3", dragging ? "text-primary" : "text-slate-300")} />
            <p className="text-sm font-medium text-slate-700 mb-1">
              {dragging ? "Drop your CSV file here" : "Drag & drop your CSV file here"}
            </p>
            <p className="text-xs text-slate-400">
              or{" "}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
              >
                browse files
              </button>
            </p>
          </div>

          {headerError && (
            <div className="mx-4 mb-4 flex items-start gap-2 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {headerError}
            </div>
          )}

          <div className="mx-4 mb-4 flex items-center justify-between pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500">Need a template?</p>
            <Button type="button" variant="secondary" onClick={downloadTemplate}>
              <span className="flex items-center gap-1.5">
                <Download className="w-4 h-4" /> Download Template
              </span>
            </Button>
          </div>
        </Card>
      )}

      {/* Checking */}
      {checking && (
        <Card>
          <div className="text-center py-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">Validating emails and packages...</p>
          </div>
        </Card>
      )}

      {/* Preview Table */}
      {preview && !results && (
        <Card className="p-0">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Preview — {preview.length} rows</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="text-emerald-600">{selectedCount} selected</span>
                {errorCount > 0 && <span className="text-red-500 ml-2">{errorCount} errors</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport} disabled={isPending || selectedCount === 0}>
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Importing...
                  </span>
                ) : (
                  `Import ${selectedCount} Payments`
                )}
              </Button>
            </div>
          </div>
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 mr-1">Filter:</span>
            {(["all", "valid", "error"] as StatusFilter[]).map((f) => {
              const validCount = preview.length - errorCount;
              const label = f === "all" ? `All (${preview.length})`
                : f === "valid" ? `Valid (${validCount})`
                : `Errors (${errorCount})`;
              return (
                <button
                  key={f}
                  onClick={() => { setStatusFilter(f); setPage(0); }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                    statusFilter === f
                      ? f === "error" ? "bg-red-100 text-red-700"
                        : f === "valid" ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2 sticky left-0 bg-slate-50 z-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="table-checkbox"
                    />
                  </th>
                  <th className={thBase}>#</th>
                  {HEADERS.map((h) => (
                    <th key={h} className={thBase}>
                      <button
                        onClick={() => handleSort(h)}
                        className="group inline-flex items-center gap-1 hover:text-slate-600 transition-colors"
                      >
                        {h}
                        <SortIcon columnKey={h} />
                      </button>
                    </th>
                  ))}
                  <th className={cn(thBase, "sticky right-0 bg-slate-50 z-10")}>
                    <button
                      onClick={() => handleSort("status")}
                      className="group inline-flex items-center gap-1 hover:text-slate-600 transition-colors"
                    >
                      Status
                      <SortIcon columnKey="status" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedPreview.map((row) => {
                  const hasError = !!row.error;
                  const isSelected = selected.has(row.index);
                  const rowBg = hasError ? "bg-red-50" : "bg-white";
                  return (
                    <tr
                      key={row.index}
                      className={cn(rowBg, !isSelected && !hasError ? "opacity-50" : "")}
                    >
                      <td className={cn("px-4 py-2 sticky left-0 z-10", rowBg)}>
                        {hasError ? (
                          <input type="checkbox" disabled className="table-checkbox opacity-30" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(row.index)}
                            className="table-checkbox"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{row.index + 1}</td>
                      {HEADERS.map((h) => (
                        <td key={h} className="px-4 py-2 text-slate-600 whitespace-nowrap">
                          {row.data[h] || "—"}
                        </td>
                      ))}
                      <td className={cn("px-4 py-2 whitespace-nowrap sticky right-0 z-10", rowBg)}>
                        {hasError ? (
                          <span className="text-xs text-red-500">{row.error}</span>
                        ) : (
                          <Badge variant="success">Valid</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, displayRows!.length)} of {displayRows!.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={cn(
                      "w-7 h-7 rounded-lg text-xs font-medium transition-colors",
                      i === page
                        ? "bg-primary text-white"
                        : "text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Results Table */}
      {results && (
        <Card className="p-0">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Import Results</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                <span className="text-emerald-600">{results.filter((r) => r.status === "success").length} imported</span>
                {results.some((r) => r.status === "error") && (
                  <span className="text-red-500 ml-2">{results.filter((r) => r.status === "error").length} failed</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={downloadResults}>
                <span className="flex items-center gap-1.5">
                  <Download className="w-4 h-4" /> Download CSV
                </span>
              </Button>
              <Button variant="secondary" onClick={reset}>Import More</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className={thBase}>Email</th>
                  <th className={thBase}>Package</th>
                  <th className={thBase}>Amount</th>
                  <th className={thBase}>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={r.status === "error" ? "bg-red-50/50" : ""}>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.email}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.package}</td>
                    <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap font-medium">{r.amount} EGP</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.status === "success" ? (
                        <Badge variant="success">Imported</Badge>
                      ) : (
                        <span className="text-xs text-red-500">{r.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
