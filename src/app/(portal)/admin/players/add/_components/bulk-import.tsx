"use client";

import { useState, useTransition, useRef, useCallback, useMemo } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { Upload, Download, Loader2, Copy, Check, AlertCircle, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { addBulkPlayers, checkExistingEmails } from "../actions";
import type { BulkPlayerRow, BulkPlayerResult } from "./types";

const REQUIRED_HEADERS = ["first_name", "last_name", "email"];

const OPTIONAL_HEADERS = [
  "phone", "date_of_birth", "area", "height", "weight", "preferred_hand",
  "preferred_position", "health_conditions", "training_goals",
  "guardian_name", "guardian_phone",
];

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

const SORTABLE_KEYS = ["name", "date_of_birth", "height", "weight", "preferred_hand", "preferred_position", "status"] as const;
type SortKey = (typeof SORTABLE_KEYS)[number];
type StatusFilter = "all" | "new" | "update" | "error";
type SortDir = "asc" | "desc";

interface PreviewRow {
  index: number;
  data: Record<string, string>;
  error?: string;
  isUpdate?: boolean;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

function getSortableHeaderKey(header: string): SortKey | null {
  if (header === "first_name") return "name";
  if (header === "date_of_birth" || header === "height" || header === "weight" || header === "preferred_hand" || header === "preferred_position") return header;
  return null;
}

export function BulkImport() {
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [results, setResults] = useState<BulkPlayerResult[] | null>(null);
  const [headerError, setHeaderError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [checking, setChecking] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 10;

  function validateRow(data: Record<string, string>): string | undefined {
    if (!data.first_name || !data.last_name || !data.email) return "Missing name or email";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Invalid email";
    return undefined;
  }

  const filteredAndSortedPreview = useMemo(() => {
    if (!preview) return preview;

    // Filter
    let rows = preview;
    if (statusFilter === "new") rows = rows.filter((r) => !r.error && !r.isUpdate);
    else if (statusFilter === "update") rows = rows.filter((r) => r.isUpdate);
    else if (statusFilter === "error") rows = rows.filter((r) => !!r.error);

    // Sort
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      if (sortKey === "name") {
        aVal = `${a.data.first_name} ${a.data.last_name}`.toLowerCase();
        bVal = `${b.data.first_name} ${b.data.last_name}`.toLowerCase();
      } else if (sortKey === "height" || sortKey === "weight") {
        aVal = a.data[sortKey] ? Number(a.data[sortKey]) : -1;
        bVal = b.data[sortKey] ? Number(b.data[sortKey]) : -1;
      } else if (sortKey === "date_of_birth" || sortKey === "preferred_hand" || sortKey === "preferred_position") {
        aVal = (a.data[sortKey] || "").toLowerCase();
        bVal = (b.data[sortKey] || "").toLowerCase();
      } else if (sortKey === "status") {
        aVal = a.error ? 2 : a.isUpdate ? 1 : 0;
        bVal = b.error ? 2 : b.isUpdate ? 1 : 0;
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
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !(h in firstRow));
    if (missingHeaders.length > 0) {
      setHeaderError(`Missing columns: ${missingHeaders.join(", ")}`);
      setPreview(null);
      return;
    }

    // Check for duplicate emails in the CSV itself
    const emailCount: Record<string, number> = {};
    rows.forEach((r) => {
      const e = r.email?.toLowerCase();
      if (e) emailCount[e] = (emailCount[e] || 0) + 1;
    });

    // Check existing emails in database
    setChecking(true);
    const emails = rows.map((r) => r.email).filter(Boolean);
    const existingEmails = await checkExistingEmails(emails);
    const existingSet = new Set(existingEmails);
    setChecking(false);

    const previewRows: PreviewRow[] = rows.map((data, i) => {
      const basicError = validateRow(data);
      if (basicError) return { index: i, data, error: basicError };

      const email = data.email.toLowerCase();
      if (emailCount[email] > 1) return { index: i, data, error: "Duplicate email in CSV" };
      if (existingSet.has(email)) return { index: i, data, isUpdate: true };

      return { index: i, data };
    });

    setPreview(previewRows);
    setPage(0);
    setSortKey(null);
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
  }, []);

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

    const bulkRows: BulkPlayerRow[] = selectedRows.map((r) => ({
      first_name: r.data.first_name,
      last_name: r.data.last_name,
      email: r.data.email,
      phone: r.data.phone || undefined,
      date_of_birth: r.data.date_of_birth || undefined,
      area: r.data.area || undefined,
      height: r.data.height ? Number(r.data.height) : null,
      weight: r.data.weight ? Number(r.data.weight) : null,
      preferred_hand: r.data.preferred_hand || undefined,
      preferred_position: r.data.preferred_position || undefined,
      health_conditions: r.data.health_conditions || undefined,
      training_goals: r.data.training_goals || undefined,
      guardian_name: r.data.guardian_name || undefined,
      guardian_phone: r.data.guardian_phone || undefined,
    }));

    startTransition(async () => {
      const res = await addBulkPlayers(bulkRows);
      setResults(res);
      setPreview(null);
    });
  }

  function handleCopyPassword(password: string, idx: number) {
    navigator.clipboard.writeText(password);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  function downloadResults() {
    if (!results) return;
    const header = "name,email,status,password,error\n";
    const rows = results.map((r) =>
      `"${r.name}","${r.email}","${r.status}","${r.password || ""}","${r.error || ""}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `player-import-results-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTemplate() {
    const headers = ALL_HEADERS.join(",");
    const example = "Ahmed,Mohamed,ahmed@email.com,01234567890,2010-05-15,Maadi,165,60,right,defender,None,Improve skills,Mohamed Ali,01098765432";
    const blob = new Blob([headers + "\n" + example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "player-import-template.csv";
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
      {/* Upload Area — Drag & Drop */}
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

      {/* Checking emails */}
      {checking && (
        <Card>
          <div className="text-center py-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">Checking for existing emails...</p>
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
                  `Import ${selectedCount} Players`
                )}
              </Button>
            </div>
          </div>
          <div className="px-5 py-2.5 border-b border-slate-100 flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 mr-1">Filter:</span>
            {(["all", "new", "update", "error"] as StatusFilter[]).map((f) => {
              const newCount = preview.filter((r) => !r.error && !r.isUpdate).length;
              const updateCount = preview.filter((r) => r.isUpdate).length;
              const label = f === "all" ? `All (${preview.length})`
                : f === "new" ? `New (${newCount})`
                : f === "update" ? `Update (${updateCount})`
                : `Errors (${errorCount})`;
              return (
                <button
                  key={f}
                  onClick={() => { setStatusFilter(f); setPage(0); }}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                    statusFilter === f
                      ? f === "error" ? "bg-red-100 text-red-700"
                        : f === "update" ? "bg-amber-100 text-amber-700"
                        : f === "new" ? "bg-emerald-100 text-emerald-700"
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
                  {ALL_HEADERS.map((h) => {
                    const sortableKey = getSortableHeaderKey(h);
                    if (sortableKey) {
                      return (
                        <th key={h} className={thBase}>
                          <button
                            onClick={() => handleSort(sortableKey)}
                            className="group inline-flex items-center gap-1 hover:text-slate-600 transition-colors"
                          >
                            {h.replace(/_/g, " ")}
                            <SortIcon columnKey={sortableKey} />
                          </button>
                        </th>
                      );
                    }
                    return <th key={h} className={thBase}>{h.replace(/_/g, " ")}</th>;
                  })}
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
                  const isUpdate = !!row.isUpdate;
                  const isSelected = selected.has(row.index);
                  const rowBg = hasError ? "bg-red-50" : isUpdate ? "bg-amber-50" : "bg-white";
                  return (
                    <tr
                      key={row.index}
                      className={cn(
                        rowBg,
                        !isSelected && !hasError ? "opacity-50" : ""
                      )}
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
                      {ALL_HEADERS.map((h) => (
                        <td key={h} className="px-4 py-2 text-slate-600 whitespace-nowrap">
                          {row.data[h] || "—"}
                        </td>
                      ))}
                      <td className={cn("px-4 py-2 whitespace-nowrap sticky right-0 z-10", rowBg)}>
                        {hasError ? (
                          <span className="text-xs text-red-500">{row.error}</span>
                        ) : isUpdate ? (
                          <Badge variant="warning">Update</Badge>
                        ) : (
                          <Badge variant="success">New</Badge>
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
                <span className="text-emerald-600">{results.filter((r) => r.status === "success").length} created</span>
                {results.some((r) => r.status === "updated") && (
                  <span className="text-amber-600 ml-2">{results.filter((r) => r.status === "updated").length} updated</span>
                )}
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
                  <th className={thBase}>Name</th>
                  <th className={thBase}>Email</th>
                  <th className={thBase}>Status</th>
                  <th className={thBase}>Password</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className={r.status === "error" ? "bg-red-50/50" : ""}>
                    <td className="px-4 py-2.5 text-slate-900 whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.email}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.status === "success" ? (
                        <Badge variant="success">Created</Badge>
                      ) : r.status === "updated" ? (
                        <Badge variant="warning">Updated</Badge>
                      ) : (
                        <span className="text-xs text-red-500">{r.error}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.password ? (
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono bg-slate-50 px-2 py-1 rounded border border-slate-200 text-slate-700 select-all">
                            {r.password}
                          </code>
                          <button
                            onClick={() => handleCopyPassword(r.password!, i)}
                            className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
                            title="Copy"
                          >
                            {copiedIdx === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
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
