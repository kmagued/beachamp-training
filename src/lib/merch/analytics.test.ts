import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NOT_LINKED,
  OTHER_COLOR,
  bestSeller,
  bucketKeyOf,
  bucketKind,
  buckets,
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
  type Catalog,
  type CatalogItem,
  type SaleRow,
  type StockRow,
} from "./analytics";

const TODAY = "2026-09-27"; // a Sunday
const RANGE = { from: "2026-06-28", to: "2026-09-27" }; // "Last 3 months", 92 days

// ── Fixture ──────────────────────────────────────────────────────────────
const item = (i: Partial<CatalogItem> & Pick<CatalogItem, "id" | "name" | "price" | "categoryId">): CatalogItem => ({
  subcategoryId: null,
  isActive: true,
  deleted: false,
  ...i,
});

const catalog: Catalog = {
  categories: [
    { id: "app", name: "Apparel", sortOrder: 0, createdAt: "2026-09-27T00:43:12.123456+00:00" },
    { id: "acc", name: "Accessories", sortOrder: 1, createdAt: "2026-09-27T00:43:12.123457+00:00" },
    { id: "eq", name: "Equipment", sortOrder: 2, createdAt: "2026-09-27T00:43:12.123458+00:00" },
  ],
  subcategories: [
    { id: "hoodie", name: "Hoodie", categoryId: "app" },
    { id: "tee", name: "T-shirt", categoryId: "app" },
    { id: "cap", name: "Cap", categoryId: "acc" },
    { id: "wrist", name: "Wristband", categoryId: "acc" },
    { id: "ball", name: "Ball", categoryId: "eq" },
  ],
  items: new Map(
    [
      item({ id: "i-hoodie", name: "Beachamp Black Hoodie", price: 1200, categoryId: "app", subcategoryId: "hoodie" }),
      item({ id: "i-tee", name: "Classic White Tee", price: 450, categoryId: "app", subcategoryId: "tee" }),
      item({ id: "i-cap", name: "Team Cap", price: 350, categoryId: "acc", subcategoryId: "cap" }),
      item({ id: "i-ball", name: "Mikasa Beach Ball", price: 3500, categoryId: "eq", subcategoryId: "ball", isActive: false }),
      item({ id: "i-wrist", name: "Sweat Wristband", price: 100, categoryId: "acc", subcategoryId: "wrist", deleted: true }),
      item({ id: "i-legacy", name: "Old Hoodie", price: 800, categoryId: "app", isActive: false }),
    ].map((i) => [i.id, i]),
  ),
};

const sale = (id: string, date: string, amount: number, itemId: string | null, size: string | null, quantity: number | null): SaleRow => ({
  id,
  date,
  amount,
  itemId,
  size,
  quantity,
});

const SALES: SaleRow[] = [
  sale("s1", "2026-07-01", 2400, "i-hoodie", "M", 2),
  sale("s2", "2026-07-20", 1100, "i-hoodie", "L", 1),
  sale("s3", "2026-08-05", 900, "i-tee", "M", 2),
  sale("s10", "2026-06-28", 450, "i-tee", "S", 1), // first day of the range
  sale("s4", "2026-08-10", 700, "i-cap", "One size", 2),
  sale("s5", "2026-09-06", 3500, "i-ball", "One size", 1),
  sale("s6", "2026-08-12", 200, "i-wrist", "One size", 2),
  sale("s7", "2026-08-25", 1000, null, null, null), // Merch income without a product
  sale("s8", "2026-06-10", 1200, "i-hoodie", "S", 1), // before the range
  sale("s9", "2026-09-27", 800, "i-legacy", "M", 1), // last day of the range
];

const inRange = () => filterSales(SALES, catalog, { range: RANGE });

// ── Ranges ───────────────────────────────────────────────────────────────
test("resolveRange presets, counted in Cairo calendar days", () => {
  assert.deepEqual(resolveRange("this-month", TODAY), { from: "2026-09-01", to: "2026-09-27" });
  assert.deepEqual(resolveRange("last-30", TODAY), { from: "2026-08-29", to: "2026-09-27" });
  assert.deepEqual(resolveRange("last-3-months", TODAY), { from: "2026-06-28", to: "2026-09-27" });
  assert.deepEqual(resolveRange("this-year", TODAY), { from: "2026-01-01", to: "2026-09-27" });
});

test("resolveRange: last 3 months from a month end clamps to the shorter month", () => {
  assert.deepEqual(resolveRange("last-3-months", "2026-05-31"), { from: "2026-03-01", to: "2026-05-31" });
});

test("resolveRange: all time runs from the first sale, and past today when a sale is future-dated", () => {
  assert.deepEqual(resolveRange("all", TODAY, { earliest: "2025-11-02" }), { from: "2025-11-02", to: "2026-09-27" });
  assert.deepEqual(resolveRange("all", TODAY, { earliest: null }), { from: "2026-09-27", to: "2026-09-27" });
  assert.deepEqual(resolveRange("all", TODAY, { earliest: "2025-11-02", latest: "2026-10-03" }), {
    from: "2025-11-02",
    to: "2026-10-03",
  });
});

test("resolveRange: a custom range entered backwards is swapped", () => {
  assert.deepEqual(resolveRange("custom", TODAY, { custom: { from: "2026-09-10", to: "2026-09-01" } }), {
    from: "2026-09-01",
    to: "2026-09-10",
  });
});

test("previousRange is the same number of days ending the day before", () => {
  assert.deepEqual(previousRange(RANGE), { from: "2026-03-28", to: "2026-06-27" });
  assert.deepEqual(previousRange({ from: "2028-03-01", to: "2028-03-31" }), { from: "2028-01-30", to: "2028-02-29" });
});

// ── Buckets ──────────────────────────────────────────────────────────────
test("bucketKind: up to 92 days is weekly, longer is monthly", () => {
  assert.equal(bucketKind({ from: "2026-06-28", to: "2026-09-27" }), "week");
  assert.equal(bucketKind({ from: "2026-06-27", to: "2026-09-27" }), "month");
});

test("weekly buckets start on the Sunday on or before the range start", () => {
  const weeks = buckets(RANGE, "week");
  assert.equal(weeks.length, 14);
  assert.deepEqual(weeks[0], { key: "2026-06-28", label: "Jun 28", title: "Week of Jun 28" });
  assert.equal(weeks[13].key, "2026-09-27");
  assert.equal(bucketKeyOf("2026-07-01", "week"), "2026-06-28");
});

test("weekly buckets carry across a year boundary", () => {
  assert.deepEqual(
    buckets({ from: "2026-12-30", to: "2027-01-10" }, "week").map((b) => b.key),
    ["2026-12-27", "2027-01-03", "2027-01-10"],
  );
});

test("monthly buckets cover every month the range touches", () => {
  const months = buckets({ from: "2026-01-15", to: "2026-04-02" }, "month");
  assert.deepEqual(months.map((b) => b.key), ["2026-01", "2026-02", "2026-03", "2026-04"]);
  assert.deepEqual(months[0], { key: "2026-01", label: "Jan", title: "Jan 2026" });
  assert.equal(bucketKeyOf("2026-07-15", "month"), "2026-07");
});

// ── Filtering and totals ─────────────────────────────────────────────────
test("filterSales keeps both range ends and drops sales outside", () => {
  assert.deepEqual(
    inRange().map((s) => s.id).sort(),
    ["s1", "s10", "s2", "s3", "s4", "s5", "s6", "s7", "s9"],
  );
});

test("filterSales by category drops sales without a product and keeps deleted products", () => {
  assert.deepEqual(
    filterSales(SALES, catalog, { range: RANGE, categoryId: "app" }).map((s) => s.id).sort(),
    ["s1", "s10", "s2", "s3", "s9"],
  );
  assert.deepEqual(
    filterSales(SALES, catalog, { range: RANGE, categoryId: "acc" }).map((s) => s.id).sort(),
    ["s4", "s6"],
  );
  assert.deepEqual(
    filterSales(SALES, catalog, { range: RANGE, subcategoryId: "hoodie" }).map((s) => s.id).sort(),
    ["s1", "s2"],
  );
});

test("summarize: sales without a product count in revenue and sales, not units", () => {
  const t = summarize(inRange());
  assert.equal(t.revenue, 11050);
  assert.equal(t.units, 12);
  assert.equal(t.count, 9);
  assert.ok(Math.abs(t.average - 1227.78) < 0.01);
  assert.deepEqual(summarize([]), { revenue: 0, units: 0, count: 0, average: 0 });
});

test("delta is a fraction of the previous period, or null when there was nothing before", () => {
  assert.equal(delta(120, 100), 0.2);
  assert.equal(delta(80, 100), -0.2);
  assert.equal(delta(5, 0), null);
  assert.equal(delta(0, 0), null);
});

// ── Breakdowns ───────────────────────────────────────────────────────────
test("seriesOverTime: revenue per week and category, with empty weeks filled with zeros", () => {
  const points = seriesOverTime(inRange(), RANGE, "week", "revenue");
  assert.equal(points.length, 14);
  const byKey = new Map(points.map((p) => [p.bucket.key, p]));
  assert.deepEqual(byKey.get("2026-06-28")!.values, { app: 2850, acc: 0, eq: 0, [NOT_LINKED]: 0 });
  assert.equal(byKey.get("2026-06-28")!.total, 2850);
  assert.deepEqual(byKey.get("2026-07-05")!.values, { app: 0, acc: 0, eq: 0, [NOT_LINKED]: 0 });
  assert.equal(byKey.get("2026-08-09")!.values.acc, 900);
  assert.equal(byKey.get("2026-08-23")!.values[NOT_LINKED], 1000);
  assert.equal(byKey.get("2026-09-27")!.values.app, 800);
});

test("seriesOverTime: units leave out sales without a product", () => {
  const points = seriesOverTime(inRange(), RANGE, "week", "units");
  const byKey = new Map(points.map((p) => [p.bucket.key, p]));
  assert.equal(byKey.get("2026-06-28")!.values.app, 3);
  assert.equal(NOT_LINKED in byKey.get("2026-08-23")!.values, false);
  assert.equal(byKey.get("2026-08-23")!.total, 0);
});

test("byCategory ranks categories by revenue and puts sales without a product last", () => {
  const rows = byCategory(inRange(), catalog);
  assert.deepEqual(
    rows.map((r) => [r.key, r.name, r.revenue, r.units]),
    [
      ["app", "Apparel", 5650, 7],
      ["eq", "Equipment", 3500, 1],
      ["acc", "Accessories", 900, 4],
      [NOT_LINKED, "Not linked to a product", 1000, null],
    ],
  );
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.share, 0) - 1) < 1e-9);
});

test("bySubcategory ranks by revenue (ties by name) and groups products without a sub-category", () => {
  const rows = bySubcategory(inRange(), catalog);
  assert.deepEqual(
    rows.map((r) => [r.name, r.categoryId, r.revenue, r.units]),
    [
      ["Ball", "eq", 3500, 1],
      ["Hoodie", "app", 3500, 3],
      ["T-shirt", "app", 1350, 3],
      ["No sub-category", "app", 800, 1],
      ["Cap", "acc", 700, 2],
      ["Wristband", "acc", 200, 2],
    ],
  );
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});

test("byProduct: averages show discounts, deleted and hidden products keep their sales", () => {
  const onHand = new Map([
    ["i-hoodie", 13],
    ["i-tee", 20],
    ["i-cap", 2],
    ["i-ball", 5],
    ["i-legacy", 0],
  ]);
  const rows = byProduct(inRange(), catalog, onHand);
  assert.deepEqual(
    rows.map((r) => r.key),
    ["i-hoodie", "i-ball", "i-tee", NOT_LINKED, "i-legacy", "i-cap", "i-wrist"],
  );
  const hoodie = rows[0];
  assert.equal(hoodie.units, 3);
  assert.equal(hoodie.revenue, 3500);
  assert.ok(Math.abs(hoodie.avgPrice! - 1166.67) < 0.01);
  assert.equal(hoodie.listPrice, 1200);
  assert.equal(hoodie.onHand, 13);
  assert.equal(hoodie.lastSold, "2026-07-20");
  assert.equal(hoodie.entries, 2);
  assert.equal(hoodie.categoryName, "Apparel");
  assert.equal(hoodie.subcategoryName, "Hoodie");

  const tee = rows.find((r) => r.key === "i-tee")!;
  assert.equal(tee.lastSold, "2026-08-05");

  assert.equal(rows.find((r) => r.key === "i-ball")!.hidden, true);
  const wrist = rows.find((r) => r.key === "i-wrist")!;
  assert.equal(wrist.deleted, true);
  assert.equal(wrist.onHand, null);

  const unlinked = rows.find((r) => r.key === NOT_LINKED)!;
  assert.deepEqual(
    [unlinked.name, unlinked.units, unlinked.avgPrice, unlinked.listPrice, unlinked.onHand, unlinked.categoryId],
    ["Not linked to a product", null, null, null, null, null],
  );
});

test("bySize counts sized sales in size order, leaving out One size and sales without a size", () => {
  const withLegacy = filterSales([...SALES, sale("s11", "2026-08-01", 1200, "i-hoodie", null, 1)], catalog, {
    range: RANGE,
  });
  assert.deepEqual(bySize(withLegacy), [
    { size: "S", units: 1, byCategory: { app: 1 } },
    { size: "M", units: 5, byCategory: { app: 5 } },
    { size: "L", units: 1, byCategory: { app: 1 } },
  ]);
});

test("bestSeller: most units, ties broken by revenue, never the unlinked row", () => {
  const rows = byProduct(inRange(), catalog, new Map());
  assert.equal(bestSeller(rows)!.key, "i-hoodie");
  assert.equal(bestSeller([]), null);
});

// ── Stock ────────────────────────────────────────────────────────────────
const STOCK: StockRow[] = [
  { itemId: "i-hoodie", size: "S", quantity: 4 },
  { itemId: "i-hoodie", size: "M", quantity: 0 },
  { itemId: "i-hoodie", size: "L", quantity: 7 },
  { itemId: "i-hoodie", size: "XL", quantity: 2 },
  { itemId: "i-tee", size: "S", quantity: 0 },
  { itemId: "i-tee", size: "M", quantity: 12 },
  { itemId: "i-tee", size: "L", quantity: 8 },
  { itemId: "i-cap", size: "One size", quantity: 2 },
  { itemId: "i-ball", size: "One size", quantity: 5 },
  { itemId: "i-legacy", size: "M", quantity: 0 },
  { itemId: "i-wrist", size: "One size", quantity: 1 },
];

test("stockAlerts: visible products only, sold-out first, then by what sold in the period", () => {
  assert.deepEqual(
    stockAlerts(STOCK, catalog, inRange(), {}).map((a) => [a.itemId, a.size, a.status, a.quantity, a.sold]),
    [
      ["i-hoodie", "M", "out", 0, 2],
      ["i-tee", "S", "out", 0, 1],
      ["i-cap", "One size", "low", 2, 2],
      ["i-hoodie", "XL", "low", 2, 0],
    ],
  );
  assert.deepEqual(
    stockAlerts(STOCK, catalog, inRange(), { categoryId: "acc" }).map((a) => a.itemId),
    ["i-cap"],
  );
});

test("stockTotals: units and value at price for products not deleted", () => {
  assert.deepEqual(stockTotals(STOCK, catalog, {}), { units: 40, value: 42800 });
  assert.deepEqual(stockTotals(STOCK, catalog, { categoryId: "eq" }), { units: 5, value: 17500 });
});

// ── Colours ──────────────────────────────────────────────────────────────
test("categoryColors follow creation order to the microsecond, whatever the ids", () => {
  const colors = categoryColors([
    { id: "a1", createdAt: "2026-09-27T00:43:12.123458+00:00" },
    { id: "c3", createdAt: "2026-09-27T00:43:12.12345+00:00" },
    { id: "b2", createdAt: "2026-09-27T00:43:12.123451+00:00" },
  ]);
  assert.equal(colors.get("c3"), "#2a78d6");
  assert.equal(colors.get("b2"), "#eb6834");
  assert.equal(colors.get("a1"), "#1baf7a");
});

test("categoryColors: past eight categories, and for unlinked sales, the colour is grey", () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, createdAt: `2026-01-0${i + 1}T00:00:00+00:00` }));
  const colors = categoryColors(nine);
  assert.equal(colors.get("c7"), "#e34948");
  assert.equal(colorFor("c8", colors), OTHER_COLOR);
  assert.equal(colorFor(NOT_LINKED, colors), OTHER_COLOR);
  assert.equal(OTHER_COLOR, "#a8a59d");
});
