"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Package } from "lucide-react";
import { Card, Select } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/** Confirmed income for one package in one Cairo month ("YYYY-MM"). */
export interface PackageIncome {
  month: string;
  pkg: string;
  amount: number;
}

interface IncomeByPackageProps {
  data: PackageIncome[];
  /** Current Cairo month ("YYYY-MM"), passed from the server so the default doesn't depend on the viewer's timezone */
  currentMonth: string;
}

// Categorical slots in a fixed, colorblind-validated order (light surface). Packages past
// the last slot fold into "Other" rather than getting a generated hue.
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const OTHER_COLOR = "#a8a59d";
const OTHER_LABEL = "Other packages";
const ALL_TIME = "all";

const AXIS_TEXT = "#5A6B73";
const GRID = "#ECE8DF";

function monthLabel(key: string, style: "long" | "short" = "long") {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: style === "long" ? "numeric" : "2-digit",
  });
}

function monthRange(from: string, to: string) {
  const keys: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [toY, toM] = to.split("-").map(Number);
  while (y < toY || (y === toY && m <= toM)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
}

const egp = (v: number) => `${Math.round(v).toLocaleString("en-US")} EGP`;

function formatShare(amount: number, total: number) {
  const pct = (amount / total) * 100;
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

interface TrendPoint {
  month: string;
  [seriesKey: string]: number | string;
}

interface Series {
  key: string;
  name: string;
  color: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TrendTooltip({ active, payload, label, series }: any) {
  if (!active || !payload?.length) return null;
  const rows = (series as Series[])
    .map((s) => ({ ...s, value: Number(payload[0].payload[s.key] || 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2.5 text-xs min-w-[200px]">
      <p className="text-slate-500 mb-2">{monthLabel(label)}</p>
      {rows.length === 0 ? (
        <p className="text-slate-500">No confirmed income</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <span className="w-3 h-0.5 rounded-full shrink-0" style={{ background: r.color }} />
              <span className="font-semibold text-slate-900 tabular-nums">{egp(r.value)}</span>
              <span className="text-slate-500 truncate">{r.name}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 mt-1.5">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold text-slate-900 tabular-nums">{egp(total)}</span>
          </div>
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2">Click to rank this month</p>
    </div>
  );
}

export function IncomeByPackage({ data, currentMonth }: IncomeByPackageProps) {
  const monthsWithIncome = useMemo(
    () => Array.from(new Set(data.map((d) => d.month))).sort((a, b) => b.localeCompare(a)),
    [data],
  );

  const [selected, setSelected] = useState<string>(() => {
    if (monthsWithIncome.includes(currentMonth)) return currentMonth;
    return monthsWithIncome[0] ?? ALL_TIME;
  });
  // Series key under the pointer in the ranking or legend; its line is emphasized
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // Top packages by all-time income get a color; the order comes from the data, not the
  // selected period, so a package keeps its color whichever month is being viewed.
  const { series, seriesKeyOf } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of data) totals.set(d.pkg, (totals.get(d.pkg) || 0) + d.amount);
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([pkg]) => pkg);
    const named = ranked.length > SERIES_COLORS.length ? ranked.slice(0, SERIES_COLORS.length) : ranked;
    const list: Series[] = named.map((pkg, i) => ({ key: `s${i}`, name: pkg, color: SERIES_COLORS[i] }));
    if (ranked.length > named.length) list.push({ key: "other", name: OTHER_LABEL, color: OTHER_COLOR });
    const keyByPkg = new Map(named.map((pkg, i) => [pkg, `s${i}`]));
    return { series: list, seriesKeyOf: (pkg: string) => keyByPkg.get(pkg) ?? "other" };
  }, [data]);

  const colorOf = (pkg: string) => series.find((s) => s.key === seriesKeyOf(pkg))?.color ?? OTHER_COLOR;

  const trend = useMemo<TrendPoint[]>(() => {
    if (monthsWithIncome.length === 0) return [];
    const first = monthsWithIncome[monthsWithIncome.length - 1];
    const last = currentMonth > monthsWithIncome[0] ? currentMonth : monthsWithIncome[0];
    const points = new Map<string, TrendPoint>(
      monthRange(first, last).map((month) => [
        month,
        { month, ...Object.fromEntries(series.map((s) => [s.key, 0])) },
      ]),
    );
    for (const d of data) {
      const point = points.get(d.month);
      if (!point) continue;
      const key = seriesKeyOf(d.pkg);
      point[key] = Number(point[key] || 0) + d.amount;
    }
    return [...points.values()];
  }, [data, monthsWithIncome, currentMonth, series, seriesKeyOf]);

  const ranking = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of data) {
      if (selected !== ALL_TIME && d.month !== selected) continue;
      totals.set(d.pkg, (totals.get(d.pkg) || 0) + d.amount);
    }
    const rows = [...totals.entries()]
      .map(([pkg, amount]) => ({ pkg, amount }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    return { rows, total, max: rows[0]?.amount ?? 0 };
  }, [data, selected]);

  const periodLabel = selected === ALL_TIME ? "all time" : monthLabel(selected);
  const best = ranking.rows[0];

  return (
    <Card className="sm:col-span-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2">
          <Package className="w-5 h-5 text-secondary" />
          Income by Package
        </h2>
        <Select
          aria-label="Period"
          size="sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-auto sm:min-w-40 border-slate-200 text-sm"
        >
          <option value={ALL_TIME}>All time</option>
          {monthsWithIncome.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </Select>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-primary-700/50 text-center py-12">No confirmed income yet</p>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Ranking for the selected period */}
          <div className="lg:col-span-2">
            {best ? (
              <>
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider">
                    Best performer · {periodLabel}
                  </p>
                  <p className="text-lg font-semibold text-primary-900 mt-0.5 leading-snug">{best.pkg}</p>
                  <p className="text-sm text-primary-700/70">
                    {egp(best.amount)} · {formatShare(best.amount, ranking.total)} of {egp(ranking.total)}
                  </p>
                </div>
                <ol className="space-y-3">
                  {ranking.rows.map((r, i) => {
                    const share = formatShare(r.amount, ranking.total);
                    return (
                      <li
                        key={r.pkg}
                        onMouseEnter={() => setHighlighted(seriesKeyOf(r.pkg))}
                        onMouseLeave={() => setHighlighted(null)}
                      >
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <span className={cn("text-sm leading-snug text-primary-900", i === 0 && "font-semibold")}>
                            {r.pkg}
                          </span>
                          <span className="text-sm whitespace-nowrap tabular-nums">
                            <span className="font-semibold text-primary-900">{egp(r.amount)}</span>
                            <span className="text-xs text-primary-700/50 ml-1.5">{share}</span>
                          </span>
                        </div>
                        <div className="h-1.5 rounded-sm bg-slate-100">
                          <div
                            className="h-full rounded-r-[4px]"
                            style={{ width: `${Math.max((r.amount / ranking.max) * 100, 1)}%`, background: colorOf(r.pkg) }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="text-sm text-primary-700/50 py-8">No confirmed income in {periodLabel}</p>
            )}
          </div>

          {/* Monthly trend per package */}
          <div className="lg:col-span-3 min-w-0">
            <p className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider mb-2">
              Monthly trend
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
              {series.map((s) => (
                <li
                  key={s.key}
                  onMouseEnter={() => setHighlighted(s.key)}
                  onMouseLeave={() => setHighlighted(null)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs text-primary-700/80 transition-opacity",
                    highlighted && highlighted !== s.key && "opacity-40"
                  )}
                >
                  <span className="w-3.5 h-0.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </li>
              ))}
            </ul>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trend}
                  margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
                  onClick={(state) => {
                    const point = trend[Number(state?.activeTooltipIndex)];
                    if (point) setSelected(point.month);
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(m: string) => monthLabel(m, "short")}
                    tick={{ fontSize: 11, fill: AXIS_TEXT }}
                    tickLine={false}
                    axisLine={{ stroke: "#C4D8DE" }}
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: AXIS_TEXT }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  {selected !== ALL_TIME && (
                    <ReferenceLine x={selected} stroke="#124B5D" strokeOpacity={0.4} strokeWidth={1} />
                  )}
                  <Tooltip
                    content={<TrendTooltip series={series} />}
                    cursor={{ stroke: "#C4D8DE", strokeWidth: 1 }}
                  />
                  {series.map((s) => (
                    <Line
                      key={s.key}
                      type="linear"
                      dataKey={s.key}
                      name={s.name}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeOpacity={highlighted && highlighted !== s.key ? 0.15 : 1}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
