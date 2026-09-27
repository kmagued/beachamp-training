"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BucketKind, Measure, SeriesPoint } from "@/lib/merch/analytics";
import { egp } from "@/lib/merch/format";
import { AXIS_TEXT, BASELINE, ChartCard, GRID, Legend, Segmented, TipRows, type SeriesKey } from "./chart-parts";

type Row = { key: string; label: string; title: string; total: number } & Record<string, number | string>;

const unitsLabel = (v: number) => `${v.toLocaleString("en-US")} ${v === 1 ? "unit" : "units"}`;

/**
 * One segment of a stacked column: a 2px surface gap below it when something sits
 * underneath, and a 4px rounded top when it's the highest non-zero segment.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StackSegment(props: any) {
  const { x, y, width, height, fill, payload, seriesKey, keys } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    fill: string;
    payload: Row;
    seriesKey: string;
    keys: string[];
  };
  if (!height || height <= 0) return null;
  const index = keys.indexOf(seriesKey);
  const hasBelow = keys.slice(0, index).some((k) => Number(payload[k] ?? 0) > 0);
  const isTop = !keys.slice(index + 1).some((k) => Number(payload[k] ?? 0) > 0);
  const bottom = y + height - (hasBelow ? 2 : 0);
  const h = bottom - y;
  if (h <= 0.5) return null;
  if (!isTop) return <rect x={x} y={y} width={width} height={h} fill={fill} />;
  const r = Math.min(4, h, width / 2);
  return (
    <path
      d={`M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${bottom} Z`}
      fill={fill}
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SeriesTooltip({ active, payload, series, measure }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  const format = measure === "revenue" ? egp : unitsLabel;
  const rows = [...(series as SeriesKey[])]
    .reverse()
    .map((s) => ({ key: s.key, color: s.color, label: s.name, amount: Number(row[s.key] ?? 0) }))
    .filter((r) => r.amount > 0)
    .map((r) => ({ ...r, value: format(r.amount) }));
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      <TipRows
        title={row.title}
        rows={rows.length ? rows : [{ key: "none", color: "transparent", value: "No sales", label: "" }]}
        total={rows.length > 1 ? format(row.total) : undefined}
      />
    </div>
  );
}

export function SalesOverTime({
  points,
  series,
  kind,
  measure,
  onMeasureChange,
}: {
  points: SeriesPoint[];
  /** Bottom of the stack first */
  series: SeriesKey[];
  kind: BucketKind;
  measure: Measure;
  onMeasureChange: (measure: Measure) => void;
}) {
  const rows: Row[] = points.map((p) => ({
    key: p.bucket.key,
    label: p.bucket.label,
    title: p.bucket.title,
    total: p.total,
    ...p.values,
  }));
  const keys = series.map((s) => s.key);
  const empty = rows.every((r) => r.total === 0);

  const table = (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <th className="text-left font-bold px-2 py-1.5">{kind === "week" ? "Week of" : "Month"}</th>
          {series.map((s) => (
            <th key={s.key} className="text-right font-bold px-2 py-1.5">
              {s.name}
            </th>
          ))}
          <th className="text-right font-bold px-2 py-1.5">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-100">
            <td className="px-2 py-1.5 text-slate-600">{kind === "week" ? r.label : r.title}</td>
            {series.map((s) => (
              <td key={s.key} className="px-2 py-1.5 text-right text-slate-700">
                {Number(r[s.key] ?? 0).toLocaleString("en-US")}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-semibold text-slate-900">{r.total.toLocaleString("en-US")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Sales over time"
      subtitle={`${kind === "week" ? "Weekly" : "Monthly"}, stacked by category${measure === "units" ? " · sales without a product have no units" : ""}`}
      tools={
        <Segmented
          label="Measure"
          value={measure}
          onChange={onMeasureChange}
          options={[
            { value: "revenue", label: "Revenue" },
            { value: "units", label: "Units" },
          ]}
        />
      }
      table={table}
    >
      <Legend items={series} />
      {empty ? (
        <p className="py-16 text-center text-sm text-slate-400">No merch sales in this period</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                tickLine={false}
                axisLine={{ stroke: BASELINE }}
                minTickGap={12}
              />
              <YAxis
                tick={{ fontSize: 11, fill: AXIS_TEXT }}
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={false}
                tickFormatter={(v: number) => (measure === "revenue" && v >= 1000 ? `${v / 1000}k` : v.toLocaleString("en-US"))}
              />
              <Tooltip
                cursor={{ fill: "rgba(18, 75, 93, 0.05)" }}
                content={<SeriesTooltip series={series} measure={measure} />}
              />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="sales"
                  fill={s.color}
                  maxBarSize={24}
                  isAnimationActive={false}
                  shape={(props: unknown) => <StackSegment {...(props as object)} seriesKey={s.key} keys={keys} />}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
