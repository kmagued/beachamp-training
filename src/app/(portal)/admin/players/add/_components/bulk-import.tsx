"use client";

import { useState, useTransition, useRef } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { Upload, Download, Loader2, Copy, Check, AlertCircle } from "lucide-react";
import { addBulkPlayers } from "../actions";
import type { PackageOption, BulkPlayerRow, BulkPlayerResult } from "./types";
import type { PaymentMethod } from "@/types/database";

const EXPECTED_HEADERS = [
  "first_name", "last_name", "email", "phone", "package",
  "start_date", "end_date", "sessions_remaining", "sessions_total",
  "amount", "method",
];

const VALID_METHODS = ["instapay", "cash"];

interface PreviewRow {
  index: number;
  data: Record<string, string>;
  error?: string;
}

interface BulkImportProps {
  packages: PackageOption[];
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

export function BulkImport({ packages }: BulkImportProps) {
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [results, setResults] = useState<BulkPlayerResult[] | null>(null);
  const [headerError, setHeaderError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const packageNames = new Set(packages.map((p) => p.name.toLowerCase()));

  function validateRow(data: Record<string, string>): string | undefined {
    if (!data.first_name || !data.last_name || !data.email) return "Missing name or email";
    if (!data.package) return "Missing package";
    if (!packageNames.has(data.package.toLowerCase())) return `Unknown package "${data.package}"`;
    if (!data.start_date || !data.end_date) return "Missing dates";
    if (!data.sessions_remaining || !data.sessions_total) return "Missing session counts";
    if (!data.amount) return "Missing amount";
    if (data.method && !VALID_METHODS.includes(data.method.toLowerCase())) return `Invalid method "${data.method}"`;
    return undefined;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults(null);
    setHeaderError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);

      if (rows.length === 0) {
        setHeaderError("CSV is empty or has no data rows");
        setPreview(null);
        return;
      }

      // Check headers
      const firstRow = rows[0];
      const missingHeaders = EXPECTED_HEADERS.filter((h) => !(h in firstRow));
      if (missingHeaders.length > 0) {
        setHeaderError(`Missing columns: ${missingHeaders.join(", ")}`);
        setPreview(null);
        return;
      }

      const previewRows: PreviewRow[] = rows.map((data, i) => ({
        index: i,
        data,
        error: validateRow(data),
      }));
      setPreview(previewRows);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!preview) return;
    const validRows = preview.filter((r) => !r.error);
    if (validRows.length === 0) return;

    const bulkRows: BulkPlayerRow[] = validRows.map((r) => ({
      first_name: r.data.first_name,
      last_name: r.data.last_name,
      email: r.data.email,
      phone: r.data.phone || "",
      package_name: r.data.package,
      start_date: r.data.start_date,
      end_date: r.data.end_date,
      sessions_remaining: Number(r.data.sessions_remaining),
      sessions_total: Number(r.data.sessions_total),
      amount: Number(r.data.amount),
      method: (r.data.method?.toLowerCase() || "cash") as PaymentMethod,
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

  function reset() {
    setPreview(null);
    setResults(null);
    setHeaderError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const validCount = preview?.filter((r) => !r.error).length ?? 0;
  const errorCount = preview?.filter((r) => r.error).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      {!preview && !results && (
        <Card>
          <div className="text-center py-8">
            <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700 mb-1">Upload CSV File</p>
            <p className="text-xs text-slate-400 mb-4">
              Expected columns: {EXPECTED_HEADERS.join(", ")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Choose File
            </Button>
          </div>
          {headerError && (
            <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {headerError}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">CSV Template</p>
            <code className="block text-xs bg-slate-50 rounded-lg p-3 overflow-x-auto text-slate-600 whitespace-pre">
{`first_name,last_name,email,phone,package,start_date,end_date,sessions_remaining,sessions_total,amount,method
Ahmed,Mohamed,ahmed@email.com,01234567890,Monthly,2026-02-01,2026-03-01,6,8,1000,cash`}
            </code>
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
                <span className="text-emerald-600">{validCount} valid</span>
                {errorCount > 0 && <span className="text-red-500 ml-2">{errorCount} errors</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport} disabled={isPending || validCount === 0}>
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Importing...
                  </span>
                ) : (
                  `Import ${validCount} Players`
                )}
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">#</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Name</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Email</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Package</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Dates</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Sessions</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Amount</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.index} className={row.error ? "bg-red-50/50" : ""}>
                    <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{row.index + 1}</td>
                    <td className="px-4 py-2 text-slate-900 whitespace-nowrap">{row.data.first_name} {row.data.last_name}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.data.email}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.data.package}</td>
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{row.data.start_date} → {row.data.end_date}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.data.sessions_remaining}/{row.data.sessions_total}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.data.amount} EGP</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {row.error ? (
                        <span className="text-xs text-red-500">{row.error}</span>
                      ) : (
                        <Badge variant="success">Valid</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Name</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Email</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Status</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">Password</th>
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
