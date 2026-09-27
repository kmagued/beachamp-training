"use client";

import { cn } from "@/lib/utils/cn";
import { colorFor, type CategoryShare, type SizeRow, type SubcategoryRow } from "@/lib/merch/analytics";
import { egp, formatShare } from "@/lib/merch/format";
import { ChartCard, HoverTip, Legend, TipRows, type SeriesKey } from "./chart-parts";

const TH = "text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1.5";
const TD = "px-2 py-1.5 border-t border-slate-100";

const units = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "unit" : "units"}`;

// ── By category ──────────────────────────────────────────────────────────

export function CategoryShareCard({ rows, colors }: { rows: CategoryShare[]; colors: Map<string, string> }) {
  const table = (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr>
          <th className={cn(TH, "text-left")}>Category</th>
          <th className={cn(TH, "text-right")}>Revenue</th>
          <th className={cn(TH, "text-right")}>Share</th>
          <th className={cn(TH, "text-right")}>Units</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={cn(TD, "font-semibold text-slate-700")}>{r.name}</td>
            <td className={cn(TD, "text-right")}>{egp(r.revenue)}</td>
            <td className={cn(TD, "text-right")}>{formatShare(r.share)}</td>
            <td className={cn(TD, "text-right")}>{r.units == null ? "–" : r.units}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title="By category" subtitle="Share of revenue" table={table}>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No sales in this period</p>
      ) : (
        <>
          <div className="flex gap-[2px] h-3.5 mb-3">
            {rows.map((r, i) => (
              <HoverTip
                key={r.key}
                className={cn("block h-full", i === rows.length - 1 && "rounded-r")}
                style={{ width: `${r.share * 100}%`, background: colorFor(r.key, colors) }}
                tip={
                  <TipRows
                    title={r.name}
                    rows={[{ key: r.key, color: colorFor(r.key, colors), value: egp(r.revenue), label: formatShare(r.share) }]}
                  />
                }
              >
                <span className="sr-only">{r.name}</span>
              </HoverTip>
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.key} className="grid grid-cols-[12px_1fr_auto_44px_64px] items-center gap-2 py-1.5 text-sm tabular-nums">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorFor(r.key, colors) }} />
                <span className="font-semibold text-slate-800 truncate">{r.name}</span>
                <span className="font-bold text-slate-900 text-right">{r.revenue.toLocaleString("en-US")}</span>
                <span className="text-xs text-slate-400 text-right">{formatShare(r.share)}</span>
                <span className="text-xs text-slate-400 text-right">{r.units == null ? "no units" : units(r.units)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

// ── By sub-category ──────────────────────────────────────────────────────

export function SubcategoryBarsCard({
  rows,
  colors,
  categories,
}: {
  rows: SubcategoryRow[];
  colors: Map<string, string>;
  categories: SeriesKey[];
}) {
  const max = rows[0]?.revenue ?? 0;
  const categoryName = new Map(categories.map((c) => [c.key, c.name]));

  const table = (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr>
          <th className={cn(TH, "text-left")}>Sub-category</th>
          <th className={cn(TH, "text-left")}>Category</th>
          <th className={cn(TH, "text-right")}>Revenue</th>
          <th className={cn(TH, "text-right")}>Units</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={cn(TD, "font-semibold text-slate-700")}>{r.name}</td>
            <td className={cn(TD, "text-slate-500")}>{categoryName.get(r.categoryId) ?? ""}</td>
            <td className={cn(TD, "text-right")}>{egp(r.revenue)}</td>
            <td className={cn(TD, "text-right")}>{r.units}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title="By sub-category" subtitle="Revenue, highest first" table={table}>
      <Legend items={categories} />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No product sales in this period</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[88px_1fr] items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 truncate" title={r.name}>
                {r.name}
              </span>
              <div className="flex items-center gap-2 min-w-0">
                <HoverTip
                  className="block h-3 rounded-r shrink-0"
                  style={{
                    width: `calc((100% - 8.5rem) * ${max ? r.revenue / max : 0})`,
                    minWidth: 2,
                    background: colorFor(r.categoryId, colors),
                  }}
                  tip={
                    <TipRows
                      title={`${r.name} · ${categoryName.get(r.categoryId) ?? ""}`}
                      rows={[{ key: r.key, color: colorFor(r.categoryId, colors), value: egp(r.revenue), label: units(r.units) }]}
                    />
                  }
                >
                  <span className="sr-only">{`${r.name}: ${egp(r.revenue)}`}</span>
                </HoverTip>
                <span className="text-xs font-bold text-slate-900 whitespace-nowrap tabular-nums">
                  {r.revenue.toLocaleString("en-US")}{" "}
                  <span className="font-medium text-slate-400">· {units(r.units)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

// ── By size ──────────────────────────────────────────────────────────────

export function SizeColumnsCard({ rows, series }: { rows: SizeRow[]; series: SeriesKey[] }) {
  const max = Math.max(0, ...rows.map((r) => r.units));
  const used = series.filter((s) => rows.some((r) => (r.byCategory[s.key] ?? 0) > 0));

  const table = (
    <table className="w-full text-xs tabular-nums">
      <thead>
        <tr>
          <th className={cn(TH, "text-left")}>Size</th>
          {used.length > 1 &&
            used.map((s) => (
              <th key={s.key} className={cn(TH, "text-right")}>
                {s.name}
              </th>
            ))}
          <th className={cn(TH, "text-right")}>Units</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.size}>
            <td className={cn(TD, "font-semibold text-slate-700")}>{r.size}</td>
            {used.length > 1 &&
              used.map((s) => (
                <td key={s.key} className={cn(TD, "text-right")}>
                  {r.byCategory[s.key] ?? 0}
                </td>
              ))}
            <td className={cn(TD, "text-right font-semibold")}>{r.units}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title="By size" subtitle="Units sold · products with sizes" table={table}>
      <Legend items={used} />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No sized products sold in this period</p>
      ) : (
        <>
          <div className="flex items-end justify-around h-40 border-b px-2" style={{ borderColor: "#C4D8DE" }}>
            {rows.map((r) => {
              const segments = used.filter((s) => (r.byCategory[s.key] ?? 0) > 0);
              return (
                <div key={r.size} className="flex flex-col items-center justify-end h-full w-12">
                  <span className="text-xs font-bold text-slate-900 mb-1 tabular-nums">{r.units}</span>
                  <HoverTip
                    className="flex flex-col-reverse gap-[2px] w-6"
                    style={{ height: `${max ? (r.units / max) * 120 : 0}px` }}
                    tip={
                      <TipRows
                        title={`Size ${r.size}`}
                        rows={segments.map((s) => ({
                          key: s.key,
                          color: s.color,
                          value: units(r.byCategory[s.key] ?? 0),
                          label: s.name,
                        }))}
                      />
                    }
                  >
                    {segments.map((s, i) => (
                      <span
                        key={s.key}
                        className={cn("block w-full", i === segments.length - 1 && "rounded-t")}
                        style={{ flexGrow: r.byCategory[s.key] ?? 0, background: s.color }}
                      />
                    ))}
                  </HoverTip>
                </div>
              );
            })}
          </div>
          <div className="flex justify-around px-2 pt-1.5">
            {rows.map((r) => (
              <span key={r.size} className="w-12 text-center text-[11px] font-semibold" style={{ color: "#5A6B73" }}>
                {r.size}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            &quot;One size&quot; items (caps, bottles, balls) are left out. Pick a sub-category, e.g. Hoodie, to see one product
            type.
          </p>
        </>
      )}
    </ChartCard>
  );
}
