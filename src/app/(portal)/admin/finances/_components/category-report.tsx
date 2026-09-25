import { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, Select } from "@/components/ui";
import type { EntryKind } from "./types";
import { cairoMonthKey } from "@/lib/utils/cairo-time";

/** Month label in Cairo time, so it matches the key the options sort on. */
const monthLabelFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "long",
});

/** One expense or income row, flattened so the report can chart either side */
export interface ReportEntry {
  categoryId: string;
  categoryName: string;
  amount: number;
  date: string;
}

interface CategoryReportProps {
  entries: ReportEntry[];
  kind: EntryKind;
}

const NOUNS: Record<EntryKind, { one: string; many: string }> = {
  expense: { one: "expense", many: "expenses" },
  income: { one: "income entry", many: "income entries" },
};

const COLORS = [
  "#6366f1", // primary/indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#a855f7", // purple
];

export function CategoryReport({ entries, kind }: CategoryReportProps) {
  // Holds a "YYYY-MM" key rather than a label, so months sort chronologically
  const [monthFilter, setMonthFilter] = useState("");
  const noun = NOUNS[kind];

  const monthOptions = useMemo(() => {
    const months = new Map<string, string>();
    entries.forEach((e) => {
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime())) return;
      months.set(cairoMonthKey(d), monthLabelFmt.format(d));
    });
    // Newest first — sorting the "YYYY-MM" key, since labels sort alphabetically
    return [...months.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [entries]);

  // Open on the current month. Falls back to the most recent month with data, so the
  // chart is never empty on arrival. Re-runs when switching between income and expenses,
  // but leaves a choice the user made on this side alone.
  const defaultedFor = useRef<EntryKind | null>(null);
  useEffect(() => {
    if (defaultedFor.current === kind) return;
    if (monthOptions.length === 0) return;
    const current = cairoMonthKey(new Date());
    const hasCurrent = monthOptions.some((m) => m.key === current);
    setMonthFilter(hasCurrent ? current : monthOptions[0].key);
    defaultedFor.current = kind;
  }, [kind, monthOptions]);

  const filteredEntries = useMemo(() => {
    if (!monthFilter) return entries;
    return entries.filter((e) => {
      const d = new Date(e.date);
      return !Number.isNaN(d.getTime()) && cairoMonthKey(d) === monthFilter;
    });
  }, [entries, monthFilter]);

  const report = useMemo(() => {
    const byCategory: Record<string, { name: string; count: number; total: number }> = {};

    for (const entry of filteredEntries) {
      const catName = entry.categoryName || "Uncategorized";
      const catId = entry.categoryId;
      if (!byCategory[catId]) {
        byCategory[catId] = { name: catName, count: 0, total: 0 };
      }
      byCategory[catId].count += 1;
      byCategory[catId].total += entry.amount;
    }

    const rows = Object.values(byCategory).sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

    return { rows, grandTotal };
  }, [filteredEntries]);

  if (report.rows.length === 0 && !monthFilter) {
    return (
      <p className="text-center text-sm text-slate-400 py-8">No {noun.many} to report</p>
    );
  }

  const pieData = report.rows.map((row, i) => ({
    name: row.name,
    value: row.total,
    color: COLORS[i % COLORS.length],
    count: row.count,
    pct: report.grandTotal > 0 ? Math.round((row.total / report.grandTotal) * 100) : 0,
  }));

  return (
    <div className="space-y-4">
      <Select
        value={monthFilter}
        onChange={(e) => setMonthFilter(e.target.value)}
        className="h-10 py-0 px-3 text-sm border-slate-200 sm:w-52"
      >
        <option value="">All Time</option>
        {monthOptions.map((m) => (
          <option key={m.key} value={m.key}>{m.label}</option>
        ))}
      </Select>

      {report.rows.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No {noun.many} in this period</p>
      ) : (
        <>
          {/* Pie chart + total */}
          <Card>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-48 h-48 sm:w-56 sm:h-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="85%"
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white shadow-lg border border-slate-200 rounded-lg px-3 py-2 text-xs">
                            <p className="font-medium text-slate-900">{d.name}</p>
                            <p className="text-slate-500">{d.value.toLocaleString()} EGP ({d.pct}%)</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full">
                <div className="text-center sm:text-left mb-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total</p>
                  <p className="text-2xl font-bold text-slate-900">{report.grandTotal.toLocaleString()} EGP</p>
                  <p className="text-xs text-slate-400">{report.rows.reduce((s, r) => s + r.count, 0)} {noun.many}</p>
                </div>
                {/* Legend */}
                <div className="space-y-2">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-sm text-slate-700 flex-1 truncate">{entry.name}</span>
                      <span className="text-sm font-medium text-slate-900 shrink-0">{entry.value.toLocaleString()} EGP</span>
                      <span className="text-xs text-slate-400 w-8 text-right shrink-0">{entry.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Category cards — mobile */}
          <div className="sm:hidden space-y-2">
            {report.rows.map((row, i) => {
              const pct = report.grandTotal > 0 ? Math.round((row.total / report.grandTotal) * 100) : 0;
              return (
                <Card key={row.name} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm font-medium text-slate-900 truncate">{row.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 shrink-0 ml-2">
                      {row.total.toLocaleString()} EGP
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">{row.count} {row.count === 1 ? noun.one : noun.many}</p>
                </Card>
              );
            })}
          </div>

          {/* Desktop table */}
          <Card className="hidden sm:block overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                      Category
                    </th>
                    <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                      Count
                    </th>
                    <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                      Total
                    </th>
                    <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                      % of Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => {
                    const pct = report.grandTotal > 0
                      ? Math.round((row.total / report.grandTotal) * 100)
                      : 0;
                    return (
                      <tr key={row.name} className="hover:bg-primary-50 transition-colors">
                        <td className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {row.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-sm text-slate-500 text-right">
                          {row.count}
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-sm text-slate-700 font-medium text-right">
                          {row.total.toLocaleString()} EGP
                        </td>
                        <td className="px-4 py-3 border-b border-slate-100 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Total
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 text-right font-medium">
                      {report.rows.reduce((sum, r) => sum + r.count, 0)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">
                      {report.grandTotal.toLocaleString()} EGP
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
