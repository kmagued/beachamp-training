// Merch analytics: pure functions over merch sales (Merch income rows), the catalog and stock.
// The analytics page loads everything once and runs these in the browser on every filter
// change. Dates are Cairo calendar days (YYYY-MM-DD), as stored in income.income_date.

import { ONE_SIZE } from "../config/merch";
import { addDays, daysBetween } from "../utils/cairo-time";
import { sortSizes, stockStatus } from "./stock";

// ── Inputs ───────────────────────────────────────────────────────────────

export interface SaleRow {
  id: string;
  date: string;
  amount: number;
  itemId: string | null;
  size: string | null;
  quantity: number | null;
}

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  subcategoryId: string | null;
  isActive: boolean;
  deleted: boolean;
}

export interface AnalyticsCategory {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface AnalyticsSubcategory {
  id: string;
  name: string;
  categoryId: string;
}

export interface Catalog {
  items: Map<string, CatalogItem>;
  categories: AnalyticsCategory[];
  subcategories: AnalyticsSubcategory[];
}

export interface StockRow {
  itemId: string;
  size: string;
  quantity: number;
}

// ── Date ranges ──────────────────────────────────────────────────────────

export type RangePreset = "this-month" | "last-30" | "last-3-months" | "this-year" | "all" | "custom";

/** Inclusive on both ends */
export interface DateRange {
  from: string;
  to: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

function splitDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `date` moved back `n` calendar months, clamped to the shorter month (May 31 → Feb 28) */
function minusMonths(date: string, n: number) {
  let { y, m } = splitDate(date);
  const { d } = splitDate(date);
  m -= n;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;
}

export function resolveRange(
  preset: RangePreset,
  today: string,
  opts: { custom?: DateRange; earliest?: string | null; latest?: string | null } = {},
): DateRange {
  switch (preset) {
    case "this-month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last-30":
      return { from: addDays(today, -29), to: today };
    case "last-3-months":
      return { from: addDays(minusMonths(today, 3), 1), to: today };
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "all":
      return {
        from: opts.earliest && opts.earliest < today ? opts.earliest : today,
        // A sale dated ahead of today still belongs to "all time"
        to: opts.latest && opts.latest > today ? opts.latest : today,
      };
    case "custom": {
      const c = opts.custom ?? { from: today, to: today };
      return c.from <= c.to ? { from: c.from, to: c.to } : { from: c.to, to: c.from };
    }
  }
}

/** The same number of days, ending the day before `range` starts */
export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.from, range.to) + 1;
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(length - 1)), to };
}

// ── Time buckets ─────────────────────────────────────────────────────────

export type BucketKind = "week" | "month";

export interface Bucket {
  key: string;
  label: string;
  title: string;
}

export function bucketKind(range: DateRange): BucketKind {
  return daysBetween(range.from, range.to) + 1 <= 92 ? "week" : "month";
}

/** Weeks start on Sunday (the week in Egypt); the key is that Sunday's date */
export function bucketKeyOf(date: string, kind: BucketKind): string {
  if (kind === "month") return date.slice(0, 7);
  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -dayOfWeek);
}

export function buckets(range: DateRange, kind: BucketKind): Bucket[] {
  const out: Bucket[] = [];
  if (kind === "week") {
    for (let key = bucketKeyOf(range.from, "week"); key <= range.to; key = addDays(key, 7)) {
      const { m, d } = splitDate(key);
      const label = `${MONTHS[m - 1]} ${d}`;
      out.push({ key, label, title: `Week of ${label}` });
    }
    return out;
  }
  let { y, m } = splitDate(range.from);
  const last = range.to.slice(0, 7);
  for (let key = `${y}-${pad(m)}`; key <= last; key = `${y}-${pad(m)}`) {
    out.push({ key, label: MONTHS[m - 1], title: `${MONTHS[m - 1]} ${y}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// ── Filtering and totals ─────────────────────────────────────────────────

/** Series / row key for Merch income that isn't linked to a product */
export const NOT_LINKED = "not-linked";
/** Sub-category key prefix for products saved before sub-categories existed */
export const NO_SUBCATEGORY = "none";

const NOT_LINKED_NAME = "Not linked to a product";

export interface EnrichedSale extends SaleRow {
  item: CatalogItem | null;
  categoryId: string | null;
  subcategoryId: string | null;
}

export interface SaleFilters {
  range?: DateRange | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
}

/** Sales in the range and category / sub-category. Sales without a product have no
 *  category, so choosing one leaves them out. Deleted products keep their sales. */
export function filterSales(sales: SaleRow[], catalog: Catalog, f: SaleFilters): EnrichedSale[] {
  return sales.flatMap((s) => {
    if (f.range && (s.date < f.range.from || s.date > f.range.to)) return [];
    const item = s.itemId ? catalog.items.get(s.itemId) ?? null : null;
    const categoryId = item?.categoryId ?? null;
    const subcategoryId = item?.subcategoryId ?? null;
    if (f.categoryId && categoryId !== f.categoryId) return [];
    if (f.subcategoryId && subcategoryId !== f.subcategoryId) return [];
    return [{ ...s, item, categoryId, subcategoryId }];
  });
}

const unitsOf = (s: EnrichedSale) => (s.item && s.quantity != null ? s.quantity : 0);
const seriesKey = (s: EnrichedSale) => (s.item ? s.item.categoryId : NOT_LINKED);

export interface Totals {
  revenue: number;
  units: number;
  count: number;
  average: number;
}

export function summarize(sales: EnrichedSale[]): Totals {
  const revenue = sales.reduce((sum, s) => sum + s.amount, 0);
  const units = sales.reduce((sum, s) => sum + unitsOf(s), 0);
  return { revenue, units, count: sales.length, average: sales.length ? revenue / sales.length : 0 };
}

/** Change against the previous period as a fraction (0.2 = +20%); null when there's nothing to compare with */
export function delta(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / previous;
}

// ── Breakdowns ───────────────────────────────────────────────────────────

export type Measure = "revenue" | "units";

export interface SeriesPoint {
  bucket: Bucket;
  /** Keyed by category id, or NOT_LINKED; every key present in the result appears in every bucket */
  values: Record<string, number>;
  total: number;
}

export function seriesOverTime(sales: EnrichedSale[], range: DateRange, kind: BucketKind, measure: Measure): SeriesPoint[] {
  const counted = measure === "units" ? sales.filter((s) => s.item && s.quantity != null) : sales;
  const keys = [...new Set(counted.map(seriesKey))];
  const points: SeriesPoint[] = buckets(range, kind).map((bucket) => ({
    bucket,
    values: Object.fromEntries(keys.map((k) => [k, 0])),
    total: 0,
  }));
  const index = new Map(points.map((p, i) => [p.bucket.key, i]));
  for (const s of counted) {
    const i = index.get(bucketKeyOf(s.date, kind));
    if (i === undefined) continue;
    const value = measure === "units" ? unitsOf(s) : s.amount;
    points[i].values[seriesKey(s)] += value;
    points[i].total += value;
  }
  return points;
}

const byRevenueThenName = (a: { revenue: number; name: string }, b: { revenue: number; name: string }) =>
  b.revenue - a.revenue || a.name.localeCompare(b.name);

export interface CategoryShare {
  key: string;
  name: string;
  revenue: number;
  units: number | null;
  share: number;
}

export function byCategory(sales: EnrichedSale[], catalog: Catalog): CategoryShare[] {
  const total = sales.reduce((sum, s) => sum + s.amount, 0);
  const names = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, { revenue: number; units: number }>();
  for (const s of sales) {
    const g = groups.get(seriesKey(s)) ?? { revenue: 0, units: 0 };
    g.revenue += s.amount;
    g.units += unitsOf(s);
    groups.set(seriesKey(s), g);
  }
  const rows = [...groups].map(([key, g]) => ({
    key,
    name: key === NOT_LINKED ? NOT_LINKED_NAME : names.get(key) ?? "Unknown category",
    revenue: g.revenue,
    units: key === NOT_LINKED ? null : g.units,
    share: total ? g.revenue / total : 0,
  }));
  return rows.sort((a, b) => Number(a.key === NOT_LINKED) - Number(b.key === NOT_LINKED) || byRevenueThenName(a, b));
}

export interface SubcategoryRow {
  key: string;
  name: string;
  categoryId: string;
  revenue: number;
  units: number;
}

export function bySubcategory(sales: EnrichedSale[], catalog: Catalog): SubcategoryRow[] {
  const names = new Map(catalog.subcategories.map((s) => [s.id, s.name]));
  const groups = new Map<string, SubcategoryRow>();
  for (const s of sales) {
    if (!s.item) continue;
    // One "No sub-category" row per category, so two categories never share a key
    const key = s.item.subcategoryId ?? `${NO_SUBCATEGORY}:${s.item.categoryId}`;
    const row = groups.get(key) ?? {
      key,
      name: s.item.subcategoryId ? names.get(s.item.subcategoryId) ?? "Unknown sub-category" : "No sub-category",
      categoryId: s.item.categoryId,
      revenue: 0,
      units: 0,
    };
    row.revenue += s.amount;
    row.units += unitsOf(s);
    groups.set(key, row);
  }
  return [...groups.values()].sort(byRevenueThenName);
}

export interface ProductRow {
  key: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  units: number | null;
  revenue: number;
  share: number;
  avgPrice: number | null;
  listPrice: number | null;
  onHand: number | null;
  lastSold: string;
  hidden: boolean;
  deleted: boolean;
  entries: number;
}

export function byProduct(sales: EnrichedSale[], catalog: Catalog, onHand: Map<string, number>): ProductRow[] {
  const total = sales.reduce((sum, s) => sum + s.amount, 0);
  const categoryNames = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const subNames = new Map(catalog.subcategories.map((s) => [s.id, s.name]));
  const groups = new Map<string, { item: CatalogItem | null; revenue: number; units: number; lastSold: string; entries: number }>();
  for (const s of sales) {
    const key = s.item ? s.item.id : NOT_LINKED;
    const g = groups.get(key) ?? { item: s.item, revenue: 0, units: 0, lastSold: s.date, entries: 0 };
    g.revenue += s.amount;
    g.units += unitsOf(s);
    if (s.date > g.lastSold) g.lastSold = s.date;
    g.entries += 1;
    groups.set(key, g);
  }
  const rows: ProductRow[] = [...groups].map(([key, g]) => {
    const it = g.item;
    return {
      key,
      name: it ? it.name : NOT_LINKED_NAME,
      categoryId: it ? it.categoryId : null,
      categoryName: it ? categoryNames.get(it.categoryId) ?? null : null,
      subcategoryName: it?.subcategoryId ? subNames.get(it.subcategoryId) ?? null : null,
      units: it ? g.units : null,
      revenue: g.revenue,
      share: total ? g.revenue / total : 0,
      avgPrice: it && g.units > 0 ? g.revenue / g.units : null,
      listPrice: it ? it.price : null,
      onHand: it && !it.deleted ? onHand.get(it.id) ?? null : null,
      lastSold: g.lastSold,
      hidden: it ? !it.isActive : false,
      deleted: it ? it.deleted : false,
      entries: g.entries,
    };
  });
  return rows.sort(byRevenueThenName);
}

export interface SizeRow {
  size: string;
  units: number;
  byCategory: Record<string, number>;
}

/** Units per size for products that come in sizes ("One size" and sales without a size are left out) */
export function bySize(sales: EnrichedSale[]): SizeRow[] {
  const groups = new Map<string, SizeRow>();
  for (const s of sales) {
    if (!s.item || !s.size || s.size === ONE_SIZE || s.quantity == null) continue;
    const row = groups.get(s.size) ?? { size: s.size, units: 0, byCategory: {} };
    row.units += s.quantity;
    row.byCategory[s.item.categoryId] = (row.byCategory[s.item.categoryId] ?? 0) + s.quantity;
    groups.set(s.size, row);
  }
  return sortSizes([...groups.values()].filter((r) => r.units > 0));
}

/** Most units sold (ties go to more revenue); sales without a product never qualify */
export function bestSeller(rows: ProductRow[]): ProductRow | null {
  const ranked = rows
    .filter((r) => r.units != null && r.units > 0)
    .sort((a, b) => b.units! - a.units! || b.revenue - a.revenue);
  return ranked[0] ?? null;
}

// ── Stock ────────────────────────────────────────────────────────────────

export interface StockAlert {
  itemId: string;
  name: string;
  size: string;
  quantity: number;
  status: "out" | "low";
  /** Units of this size sold in the selected period */
  sold: number;
}

function matchesItem(item: CatalogItem, f: SaleFilters) {
  if (f.categoryId && item.categoryId !== f.categoryId) return false;
  if (f.subcategoryId && item.subcategoryId !== f.subcategoryId) return false;
  return true;
}

/** Sizes that are out or low right now, for products players can see. Sold-out sizes come
 *  first, then whatever sold most in the period, so the most-wanted gaps lead. */
export function stockAlerts(stock: StockRow[], catalog: Catalog, periodSales: EnrichedSale[], f: SaleFilters): StockAlert[] {
  const sold = new Map<string, number>();
  for (const s of periodSales) {
    if (!s.item || !s.size) continue;
    const key = `${s.item.id}|${s.size}`;
    sold.set(key, (sold.get(key) ?? 0) + unitsOf(s));
  }
  const alerts: StockAlert[] = [];
  for (const row of stock) {
    const item = catalog.items.get(row.itemId);
    if (!item || item.deleted || !item.isActive || !matchesItem(item, f)) continue;
    const status = stockStatus(row.quantity);
    if (status === "ok") continue;
    alerts.push({
      itemId: row.itemId,
      name: item.name,
      size: row.size,
      quantity: row.quantity,
      status,
      sold: sold.get(`${row.itemId}|${row.size}`) ?? 0,
    });
  }
  return alerts.sort(
    (a, b) =>
      Number(a.status === "low") - Number(b.status === "low") ||
      b.sold - a.sold ||
      a.name.localeCompare(b.name) ||
      a.size.localeCompare(b.size),
  );
}

/** Units on hand and their value at list price, for products that aren't deleted */
export function stockTotals(stock: StockRow[], catalog: Catalog, f: SaleFilters): { units: number; value: number } {
  let units = 0;
  let value = 0;
  for (const row of stock) {
    const item = catalog.items.get(row.itemId);
    if (!item || item.deleted || !matchesItem(item, f)) continue;
    units += row.quantity;
    value += row.quantity * item.price;
  }
  return { units, value };
}

// ── Colours ──────────────────────────────────────────────────────────────

/** Validated categorical order (same palette as the dashboard's income chart) */
export const CATEGORY_COLORS: readonly string[] = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

/** For a 9th category onward, and for sales without a product */
export const OTHER_COLOR = "#a8a59d";

/** Sortable form of a Postgres timestamp: fractions padded to microseconds, since
 *  seeded categories are created microseconds apart and Date keeps milliseconds only */
function timestampKey(ts: string) {
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?/);
  return m ? `${m[1]}T${m[2]}.${(m[3] ?? "").padEnd(6, "0").slice(0, 6)}` : ts;
}

/** Colour per category by creation order, so renaming or reordering never repaints one */
export function categoryColors(categories: { id: string; createdAt: string }[]): Map<string, string> {
  const ordered = [...categories].sort(
    (a, b) => timestampKey(a.createdAt).localeCompare(timestampKey(b.createdAt)) || a.id.localeCompare(b.id),
  );
  return new Map(ordered.slice(0, CATEGORY_COLORS.length).map((c, i) => [c.id, CATEGORY_COLORS[i]]));
}

export function colorFor(key: string, colors: Map<string, string>): string {
  return colors.get(key) ?? OTHER_COLOR;
}
