"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { DatePicker, Select } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import {
  NOT_LINKED,
  OTHER_COLOR,
  bestSeller,
  bucketKind,
  byCategory,
  byProduct,
  bySize,
  bySubcategory,
  categoryColors,
  colorFor,
  delta,
  filterSales,
  previousRange,
  resolveRange,
  seriesOverTime,
  stockAlerts,
  stockTotals,
  summarize,
  type AnalyticsCategory,
  type AnalyticsSubcategory,
  type Catalog,
  type CatalogItem,
  type Measure,
  type RangePreset,
  type SaleRow,
  type StockRow,
} from "@/lib/merch/analytics";
import { egp, formatDelta, formatRange, type DeltaDirection } from "@/lib/merch/format";
import { addDays } from "@/lib/utils/cairo-time";
import { SalesOverTime } from "./sales-over-time";
import { CategoryShareCard, SizeColumnsCard, SubcategoryBarsCard } from "./breakdowns";
import { StockAlerts } from "./stock-alerts";
import { ProductTable } from "./product-table";
import type { SeriesKey } from "./chart-parts";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-30", label: "Last 30 days" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "this-year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

const DELTA_CLASS: Record<DeltaDirection, string> = {
  up: "text-emerald-700",
  down: "text-red-600",
  flat: "text-slate-400",
  none: "text-slate-400",
};

function KpiTile({
  label,
  value,
  unit,
  note,
  change,
  compact,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  change?: { text: string; direction: DeltaDirection } | null;
  /** A name rather than a number: smaller, and allowed two lines */
  compact?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-3 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700/60">{label}</p>
      <p
        className={cn(
          "font-bold text-primary-900 mt-0.5",
          compact ? "text-sm leading-snug line-clamp-2" : "text-lg sm:text-xl truncate",
        )}
        title={value}
      >
        {value} {unit && <span className="text-xs font-semibold text-slate-400">{unit}</span>}
      </p>
      {change ? (
        <p className="text-[11px] text-slate-400 mt-0.5">
          <b className={cn("font-bold", DELTA_CLASS[change.direction])}>{change.text}</b> vs before
        </p>
      ) : note ? (
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{note}</p>
      ) : null}
    </div>
  );
}

export function AnalyticsClient({
  sales,
  items,
  categories,
  subcategories,
  stock,
  today,
}: {
  sales: SaleRow[];
  items: CatalogItem[];
  categories: AnalyticsCategory[];
  subcategories: AnalyticsSubcategory[];
  stock: StockRow[];
  /** Cairo calendar day, from the server so ranges don't depend on the viewer's timezone */
  today: string;
}) {
  const [preset, setPreset] = useState<RangePreset>("last-3-months");
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [measure, setMeasure] = useState<Measure>("revenue");

  const catalog: Catalog = useMemo(
    () => ({ items: new Map(items.map((i) => [i.id, i])), categories, subcategories }),
    [items, categories, subcategories],
  );
  const colors = useMemo(() => categoryColors(categories), [categories]);
  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    [categories],
  );
  const [earliest, latest] = useMemo(() => {
    if (!sales.length) return [null, null];
    let min = sales[0].date;
    let max = sales[0].date;
    for (const s of sales) {
      if (s.date < min) min = s.date;
      if (s.date > max) max = s.date;
    }
    return [min, max];
  }, [sales]);

  const range = resolveRange(preset, today, { custom, earliest, latest });
  const filters = { range, categoryId: categoryId || null, subcategoryId: subcategoryId || null };
  const compareRange = preset === "all" ? null : previousRange(range);
  const kind = bucketKind(range);

  const view = useMemo(() => {
    const current = filterSales(sales, catalog, filters);
    const previous = compareRange ? filterSales(sales, catalog, { ...filters, range: compareRange }) : null;
    const onHand = new Map<string, number>();
    for (const r of stock) onHand.set(r.itemId, (onHand.get(r.itemId) ?? 0) + r.quantity);
    const products = byProduct(current, catalog, onHand);
    return {
      current,
      totals: summarize(current),
      before: previous ? summarize(previous) : null,
      products,
      best: bestSeller(products),
      categoryRows: byCategory(current, catalog),
      subRows: bySubcategory(current, catalog),
      sizeRows: bySize(current),
      alerts: stockAlerts(stock, catalog, current, filters),
      stockTotal: stockTotals(stock, catalog, filters),
    };
    // filters/compareRange are derived from the values listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, catalog, stock, range.from, range.to, categoryId, subcategoryId, compareRange?.from, compareRange?.to]);

  // Colour means category everywhere; "Not linked" is the grey series
  const series: SeriesKey[] = useMemo(() => {
    const present = new Set(view.current.map((s) => (s.item ? s.item.categoryId : NOT_LINKED)));
    const list = orderedCategories
      .filter((c) => present.has(c.id))
      .map((c) => ({ key: c.id, name: c.name, color: colorFor(c.id, colors) }));
    if (present.has(NOT_LINKED)) list.push({ key: NOT_LINKED, name: "Not linked", color: OTHER_COLOR });
    return list;
  }, [view.current, orderedCategories, colors]);
  const productSeries = series.filter((s) => s.key !== NOT_LINKED);
  const points = useMemo(() => seriesOverTime(view.current, range, kind, measure), [view.current, range.from, range.to, kind, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (now: number, then: number | undefined) =>
    view.before && then !== undefined ? formatDelta(delta(now, then)) : null;
  const subOptions = subcategories
    .filter((s) => !categoryId || s.categoryId === categoryId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Analytics</h1>
        <p className="text-slate-500 text-sm">Merch sales recorded in Finances · amounts in EGP</p>
      </div>

      {sales.length === 0 && (
        <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">
          No merch sales recorded yet. Record one from{" "}
          <Link href="/admin/merch" className="font-semibold underline">
            Products → Record sale
          </Link>
          .
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <Select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} aria-label="Date range">
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <div className="w-36">
              <DatePicker value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <span className="text-slate-400 text-sm">to</span>
            <div className="w-36">
              <DatePicker value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </div>
        )}
        <div role="radiogroup" aria-label="Category" className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5 gap-0.5">
          {[{ id: "", name: "All" }, ...orderedCategories].map((c) => (
            <button
              key={c.id || "all"}
              type="button"
              role="radio"
              aria-checked={categoryId === c.id}
              onClick={() => {
                setCategoryId(c.id);
                setSubcategoryId("");
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                categoryId === c.id ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="w-48">
          <Select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} aria-label="Sub-category">
            <option value="">All sub-categories</option>
            {subOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="w-full sm:w-auto sm:ml-auto text-xs text-slate-400 inline-flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" />
          {formatRange(range)}
          {compareRange ? ` · compared with ${formatRange(compareRange)}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile
          label="Revenue"
          value={Math.round(view.totals.revenue).toLocaleString("en-US")}
          unit="EGP"
          change={change(view.totals.revenue, view.before?.revenue)}
        />
        <KpiTile label="Units sold" value={view.totals.units.toLocaleString("en-US")} change={change(view.totals.units, view.before?.units)} />
        <KpiTile label="Sales" value={view.totals.count.toLocaleString("en-US")} change={change(view.totals.count, view.before?.count)} />
        <KpiTile
          label="Average sale"
          value={Math.round(view.totals.average).toLocaleString("en-US")}
          unit="EGP"
          change={change(view.totals.average, view.before?.average)}
        />
        <KpiTile
          compact
          label="Best seller"
          value={view.best?.name ?? "—"}
          note={view.best ? `${view.best.units} sold · ${egp(view.best.revenue)}` : "No product sales yet"}
        />
      </div>

      <SalesOverTime
        points={points}
        series={measure === "units" ? productSeries : series}
        kind={kind}
        measure={measure}
        onMeasureChange={setMeasure}
      />

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <CategoryShareCard rows={view.categoryRows} colors={colors} />
        <SubcategoryBarsCard rows={view.subRows} colors={colors} categories={productSeries} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <SizeColumnsCard rows={view.sizeRows} series={productSeries} />
        <StockAlerts alerts={view.alerts} totals={view.stockTotal} />
      </div>

      <ProductTable rows={view.products} colors={colors} />
    </div>
  );
}
