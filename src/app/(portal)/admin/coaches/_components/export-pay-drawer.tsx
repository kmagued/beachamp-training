"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Drawer, Input } from "@/components/ui";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { cairoMonthKey } from "@/lib/utils/cairo-time";
import { shiftMonth } from "@/lib/king-of-court/month";
import { formatMonth } from "@/lib/king-of-court/format";
import { loadCoachMonth } from "@/lib/coach-pay/load";
import { grandTotal, parseRate, payTotal, summarize, type CoachAttendanceRow, type PayType } from "@/lib/coach-pay/summary";
import { buildPaySheets } from "@/lib/coach-pay/workbook";
import { exportSheetsToExcel } from "@/lib/utils/export-excel";

export interface ExportPayCoach {
  id: string;
  name: string;
}

interface ExportPayDrawerProps {
  open: boolean;
  onClose: () => void;
  /** The selected coaches, in display order */
  coaches: ExportPayCoach[];
}

interface RateEntry {
  payType: PayType;
  /** As typed; blank means no rate */
  rate: string;
}

const DEFAULT_ENTRY: RateEntry = { payType: "hourly", rate: "" };

/** Pay is usually worked out once a month has closed, so start on last month */
function defaultMonth(): string {
  return shiftMonth(cairoMonthKey(new Date()), -1);
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function ExportPayDrawer({ open, onClose, coaches }: ExportPayDrawerProps) {
  const [month, setMonth] = useState(defaultMonth);
  const [attendance, setAttendance] = useState<Record<string, CoachAttendanceRow[]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rates, setRates] = useState<Record<string, RateEntry>>({});
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Cairo's month, not the browser's: around midnight on the 1st they can differ
  const currentMonth = cairoMonthKey(new Date());
  const coachIdsKey = coaches.map((c) => c.id).join(",");

  // Rates are never saved: closing the drawer forgets them, and the next open starts fresh
  useEffect(() => {
    if (open) return;
    setMonth(defaultMonth());
    setRates({});
    setAttendance(null);
    setError(null);
    setDownloadError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCoachMonth(supabase, coachIdsKey ? coachIdsKey.split(",") : [], month)
      .then((data) => {
        if (!cancelled) setAttendance(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAttendance(null);
          setError(e instanceof Error ? e.message : "Could not load coach attendance");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // supabase is a browser singleton; the ids key stands in for the coaches array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, month, coachIdsKey, reloadKey]);

  const rows = useMemo(
    () =>
      coaches.map((c) => {
        const entry = rates[c.id] ?? DEFAULT_ENTRY;
        const coachRows = attendance?.[c.id] ?? [];
        const summary = summarize(coachRows);
        const rate = parseRate(entry.rate);
        return { ...c, entry, rate, rows: coachRows, summary, total: payTotal(entry.payType, rate, summary) };
      }),
    [coaches, rates, attendance]
  );

  const total = grandTotal(rows.map((r) => r.total));
  const missingRates = rows.filter((r) => r.rate === null).length;
  const ready = !loading && !error && attendance !== null;

  function updateEntry(id: string, patch: Partial<RateEntry>) {
    setRates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? DEFAULT_ENTRY), ...patch } }));
  }

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const sheets = buildPaySheets({
        month,
        coaches: rows.map((r) => ({ name: r.name, payType: r.entry.payType, rate: r.rate, rows: r.rows })),
      });
      await exportSheetsToExcel(sheets, `coach-pay-${month}`);
    } catch (e) {
      setDownloadError(e instanceof Error ? `Could not create the file: ${e.message}` : "Could not create the file");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Export coach pay"
      width="max-w-2xl"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
          {downloadError ? (
            <p className="text-xs text-red-600 sm:mr-auto">{downloadError}</p>
          ) : (
            ready && missingRates > 0 && (
              <p className="text-xs text-amber-600 sm:mr-auto">
                {missingRates} coach{missingRates === 1 ? " has" : "es have"} no rate
              </p>
            )
          )}
          <div className="flex items-center gap-3 sm:ml-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1 sm:flex-none gap-1.5" onClick={handleDownload} disabled={!ready || downloading}>
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Excel
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-medium text-slate-700">Month</span>
        <div className="flex items-center rounded-xl border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-slate-800 tabular-nums">
            {formatMonth(month, "long")}
          </span>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= currentMonth}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-5">
        Days and hours count sessions marked present on the Daily Report. Rates are only used for this file and aren&apos;t saved.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="text-xs font-medium text-red-600 hover:text-red-800"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <table className="hidden sm:table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-3">Coach</th>
                <th className="py-2 px-2 text-right">Days</th>
                <th className="py-2 px-2 text-right">Hours</th>
                <th className="py-2 px-2">Pay type</th>
                <th className="py-2 px-2 text-right">Rate (EGP)</th>
                <th className="py-2 pl-2 text-right">Total (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-slate-900">{r.name}</p>
                    {r.rows.length === 0 && <p className="text-xs text-slate-400">No attendance logged</p>}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{r.summary.days}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">{formatNumber(r.summary.hours)}</td>
                  <td className="py-2.5 px-2">
                    <PayTypeToggle value={r.entry.payType} onChange={(payType) => updateEntry(r.id, { payType })} />
                  </td>
                  <td className="py-2.5 px-2">
                    <RateInput name={r.name} value={r.entry.rate} onChange={(rate) => updateEntry(r.id, { rate })} />
                  </td>
                  <td className="py-2.5 pl-2 text-right tabular-nums font-medium text-slate-900">
                    {r.total === null ? <span className="text-slate-300">—</span> : formatNumber(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="pt-3 pr-2 text-right text-sm font-semibold text-slate-700">Total</td>
                <td className="pt-3 pl-2 text-right tabular-nums text-base font-semibold text-slate-900">
                  {total === null ? <span className="text-slate-300">—</span> : `${formatNumber(total)} EGP`}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-baseline justify-between gap-2 mb-2.5">
                  <p className="font-medium text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500 tabular-nums shrink-0">
                    {r.rows.length === 0
                      ? "No attendance logged"
                      : `${r.summary.days} day${r.summary.days === 1 ? "" : "s"} · ${formatNumber(r.summary.hours)} h`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PayTypeToggle value={r.entry.payType} onChange={(payType) => updateEntry(r.id, { payType })} />
                  <RateInput name={r.name} value={r.entry.rate} onChange={(rate) => updateEntry(r.id, { rate })} />
                  <p className="ml-auto text-sm font-semibold tabular-nums text-slate-900">
                    {r.total === null ? <span className="text-slate-300">—</span> : formatNumber(r.total)}
                  </p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-sm font-semibold text-slate-700">Total</span>
              <span className="text-base font-semibold tabular-nums text-slate-900">
                {total === null ? <span className="text-slate-300">—</span> : `${formatNumber(total)} EGP`}
              </span>
            </div>
          </div>
        </>
      )}
    </Drawer>
  );
}

function PayTypeToggle({ value, onChange }: { value: PayType; onChange: (value: PayType) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {(["hourly", "daily"] as const).map((type) => (
        <button
          key={type}
          type="button"
          aria-pressed={value === type}
          onClick={() => onChange(type)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
            value === type ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          {type === "hourly" ? "Hourly" : "Daily"}
        </button>
      ))}
    </div>
  );
}

function RateInput({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      placeholder="Rate"
      aria-label={`Rate for ${name}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-24 px-2.5 py-1.5 text-right tabular-nums"
    />
  );
}
