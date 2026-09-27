# Merch Inventory, Categories & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-size merch stock kept in step with sales, a card-grid Products page with Restock / Recount / Record sale, an editable Categories page, and a Merch Analytics page.

**Architecture:**
- **Postgres owns stock integrity:**
  - a `merch_stock` table;
  - a trigger on `income` that takes and gives back stock;
  - `merch_restock` / `merch_recount` RPCs;
  - a SECURITY DEFINER availability function for players.
- **Admin pages** are server-loaded Next.js App Router pages with client components and `"use server"` actions.
- **Analytics** is computed client-side by pure, unit-tested functions.

**Tech Stack:** Next.js 15 (App Router), React 19, Supabase (Postgres, RLS, supabase-js 2.49 / ssr 0.5), Tailwind 3, recharts 3, lucide-react, Node 20 test runner via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-27-merch-inventory-analytics-design.md`. Read it first. Section references (§) below point there.

**Execution note:** the user asked to start implementing straight away, and the plan author executes it natively in the same session.
- **Load-bearing code is given in full here or in the spec:** the migration, SQL tests, pure modules and their tests.
- **UI tasks are given as exact interfaces, state and behaviour,** with markup following the approved mockups in `.superpowers/brainstorm/37221-1790462239/content/`.

## Global Constraints

- **Environments:**
  - **Staging only:** DB writes (migrations, tests) go through `scripts/db/*` guards (`assert_staging_is_not_prod`). **Never write to prod.**
  - `.env.local` still points at prod; don't run the app against it for click-throughs. Use `npm run env:staging`.
- **Stock rules** (spec §1–2):
  - Low stock threshold: `LOW_STOCK_THRESHOLD = 2` (sizes at 1–2 are "low"; 0 is "out").
  - Size order everywhere: `MERCH_SIZES = ["XS","S","M","L","XL","XXL","One size"]`.
  - Error codes: `MS001` oversell, `MS002` size not stocked, `MS003` negative input.
- **Colours and dates:**
  - Category colour slots, in `created_at` order: `#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300, #4a3aa7, #e34948`; grey `#a8a59d` for the 9th+ and "Not linked".
  - Weeks start **Sunday**. Ranges ≤ 92 days bucket by week, longer ones by month.
  - Dates are Cairo calendar days: use `cairoToday()`, `addDays()` and `daysBetween()` from `src/lib/utils/cairo-time.ts`, never `new Date().toISOString()` for "today".
- **Security:**
  - Players never receive stock counts (only `in_stock` booleans).
  - Server actions call `assertAdmin()` first.
- **Style:**
  - Code follows the surrounding style: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` on `(await createClient()) as any`, `{ error }` / `{ success: true }` action results, and Tailwind classes as in existing merch files.
  - Commit messages are conventional (`feat(merch): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **Editing an existing sale in Finances** (same product and size, more units). The limit is stock + the sale's own quantity; the UI must allow what the trigger allows. Tested in Task 2 (`maxSellable`) and Task 1 (M×2 → M×3).
2. **Two admins selling the last unit at once.** Exactly one succeeds (row lock). Only the SQL can pin this; Task 1 covers the conditional `quantity >= n` update.
3. **Recount while a sale lands.** It must never overwrite; it returns fresh counts. Task 1 (stale recount) and Task 5 (UI keeps typed counts).
4. **Analytics range edges:** month-end "Last 3 months" (e.g. May 31), a leap day, and a range crossing a year boundary for weekly buckets. Task 3.
5. **Legacy rows:** a sale with a product but no size, a product with no sub-category, a deleted product with sales, and Merch income with no product. None may crash any page. Task 3 tests plus Task 4 view mappers.

---

### Task 1: Database migration + SQL tests on staging

**Files:**
- Create: `supabase/migrations/20260927000000_merch_inventory.sql` (spec §1 SQL + §2 trigger/functions)
- Create: `scripts/db/test-merch-stock.sql`, `scripts/db/test-merch-stock.sh`
- Create: `scripts/db/apply-migration.sh` (staging-only apply + stamp `supabase_migrations.schema_migrations (version, name)`, as `clone-prod-to-staging.sh` does)

**Interfaces:**
- **Produces (DB):**
  - tables `merch_categories(id, name, sort_order, created_at)` and `merch_stock(item_id, size, quantity, updated_at)`;
  - columns `merch_items.category_id`, `merch_subcategories.category_id`, `income.merch_size`;
  - trigger `income_merch_stock` → `apply_merch_sale_to_stock()`;
  - RPCs `merch_restock(p_item_id uuid, p_added jsonb) → void`, `merch_recount(p_item_id uuid, p_counts jsonb) → jsonb {ok, stock}` and `merch_available_sizes() → (item_id, size, in_stock)`.
- **Drops:** `merch_items.category`, `sizes`, `is_sold_out`; `merch_subcategories.category`.

- [ ] **Step 1: Write the SQL test** `scripts/db/test-merch-stock.sql`.
  - It opens with `BEGIN;` and closes with `ROLLBACK;`.
  - Fixtures go in `set_config('mt.*', …, true)` GUCs: an Apparel sub-category "ZZ test", a visible item "ZZ Test Hoodie" (1200 EGP) with stock M=5 and L=2, the merch income category, and an admin and a player profile.
  - Each case is a `DO` block using `ASSERT` or `EXCEPTION WHEN SQLSTATE '…'`:
    1. Insert sale M×2 → M=3.
    2. Amount-only edit → M=3.
    3. Edit to L×1 → M=5, L=1.
    4. Edit to L×2 → L=0 (own unit returned first).
    5. Soft delete → L=2.
    6. Insert M×6 → `MS001` "Only 5 × M left of ZZ Test Hoodie", M=5.
    7. Set L=0 directly, insert L×1 → `MS001` "No L left of ZZ Test Hoodie".
    8. Insert size XXL → `MS002` "ZZ Test Hoodie no longer comes in XXL".
    9. Product-linked sale without a size → `23514`.
    10. Restock `{"M":3,"L":0}` → M=8; `{"M":-1}` → `MS003`; `{"XXL":1}` → `MS002`.
    11. Recount `[{"size":"M","expected":8,"counted":7}]` → ok=true, M=7.
    12. Stale recount (`expected` 8) → ok=false, M still 7, returned `stock->>'M' = '7'`.
    13. Hard `DELETE` of an active sale gives stock back.
    14. Sale on L, then delete the L stock row, then soft-delete the sale → no error, no L row re-created.
    15. Item with category Accessories and an Apparel sub-category → `23503`.
    16. As the player (`request.jwt.claims` + `SET LOCAL ROLE authenticated`): `count(*) FROM merch_stock` = 0, and `merch_available_sizes()` returns 2 rows for the fixture, with M `in_stock` true.
- [ ] **Step 2: Write `test-merch-stock.sh`.** It sources `lib.sh`, requires the arg `staging`, runs `load_config; assert_staging_is_not_prod; require_docker; ensure_pg_image`, copies the SQL into `DUMP_DIR`, then `psql_run "$STAGING_DB_URL" --no-psqlrc --quiet -v ON_ERROR_STOP=1 -f /dump/test-merch-stock.sql`.
- [ ] **Step 3: Run it and expect FAIL.** Run `bash scripts/db/test-merch-stock.sh staging`; it should fail with `relation "merch_categories" does not exist`.
- [ ] **Step 4: Write the migration** (spec §1 verbatim plus the §2 function bodies):
  - `apply_merch_sale_to_stock()`, per spec §2, including the no-op for unchanged product, size and quantity, and give-back before take;
  - `merch_restock`, which loops over `jsonb_each_text`;
  - `merch_recount`, which does `PERFORM … FOR UPDATE`, validates, sets `stale`, updates only if not stale, and returns `jsonb_build_object('ok', NOT stale, 'stock', <jsonb_object_agg>)`;
  - `merch_available_sizes()`;
  - `REVOKE EXECUTE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated` for all three RPCs.
- [ ] **Step 5: Write `apply-migration.sh`.** Usage: `apply-migration.sh staging <file>`. It applies the file with `--single-transaction -v ON_ERROR_STOP=1`, then `INSERT INTO supabase_migrations.schema_migrations (version, name) … ON CONFLICT (version) DO NOTHING`. It refuses any target other than `staging`.
- [ ] **Step 6: Apply to staging and re-run the tests; expect PASS.** Run `bash scripts/db/apply-migration.sh staging supabase/migrations/20260927000000_merch_inventory.sql && bash scripts/db/test-merch-stock.sh staging`. Expected: no ASSERT failures, and the final `ROLLBACK`.
- [ ] **Step 7: Commit:** `feat(merch): per-size stock, editable categories and sale-driven stock trigger`

### Task 2: Test runner + pure stock helpers

**Files:**
- Modify: `package.json` (`"test": "tsx --test src/lib/merch/*.test.ts"`)
- Modify: `src/lib/config/merch.ts`. Add `ONE_SIZE`, `LOW_STOCK_THRESHOLD` and `MerchStockLevel`. Keep existing exports for now; Task 4 reshapes the file.
- Create: `src/lib/merch/stock.ts`, `src/lib/merch/stock.test.ts`

**Interfaces (produces):**
```ts
export type StockStatus = "out" | "low" | "ok";
export function sortSizes<T extends { size: string }>(rows: T[]): T[];          // MERCH_SIZES order; unknown sizes last, A→Z
export function stockStatus(quantity: number): StockStatus;                      // 0 → out, 1..2 → low, else ok
export interface StockSummary { total: number; lowSizes: number; outSizes: number; soldOut: boolean } // soldOut: ≥1 size and all 0
export function stockSummary(stock: { quantity: number }[]): StockSummary;
export function maxSellable(stock: MerchStockLevel[], size: string, editing?: { size: string; quantity: number } | null): number;
export interface RecountChange { size: string; expected: number; counted: number }
export function recountChanges(current: MerchStockLevel[], counted: Record<string, number>): RecountChange[]; // only sizes whose count differs
export function restockTotal(added: Record<string, number>): number;              // sum of positive entries
```

- [ ] **Step 1: Write the failing tests.** Use `node:test` + `node:assert/strict`.
  - `stockStatus` at 0/1/2/3.
  - `sortSizes` with `["L","One size","XS","M","Z"]` → `XS,M,L,One size,Z`.
  - `stockSummary` for empty, mixed and all-zero stock.
  - `maxSellable`: a new sale; editing the same size (adds own quantity); editing a different size (doesn't); a missing size → 0.
  - `recountChanges` ignores unchanged and missing sizes.
  - `restockTotal` ignores 0 and negatives.
- [ ] **Step 2:** Run `npm test` and expect FAIL (cannot find module `./stock`).
- [ ] **Step 3:** Implement `stock.ts`, importing `MERCH_SIZES` and `LOW_STOCK_THRESHOLD` from `../config/merch` by a relative path so `tsx` resolves without aliases.
- [ ] **Step 4:** Run `npm test` and expect PASS.
- [ ] **Step 5: Commit:** `feat(merch): stock helpers and test runner`

### Task 3: Pure analytics module

**Files:** Create `src/lib/merch/analytics.ts`, `src/lib/merch/analytics.test.ts`

**Interfaces (produces):**
```ts
export interface SaleRow { id: string; date: string; amount: number; itemId: string | null; size: string | null; quantity: number | null }
export interface CatalogItem { id: string; name: string; price: number; categoryId: string; subcategoryId: string | null; isActive: boolean; deleted: boolean }
// Own input shapes (camelCase) so this module doesn't depend on the view types Task 4 reshapes;
// the analytics page maps DB rows into these.
export interface AnalyticsCategory { id: string; name: string; sortOrder: number; createdAt: string }
export interface AnalyticsSubcategory { id: string; name: string; categoryId: string }
export interface Catalog { items: Map<string, CatalogItem>; categories: AnalyticsCategory[]; subcategories: AnalyticsSubcategory[] }
export type RangePreset = "this-month" | "last-30" | "last-3-months" | "this-year" | "all" | "custom";
export interface DateRange { from: string; to: string }                        // inclusive YYYY-MM-DD
export function resolveRange(preset: RangePreset, today: string, opts?: { custom?: DateRange; earliest?: string | null }): DateRange;
export function previousRange(range: DateRange): DateRange;                    // same length, ends the day before `from`
export type BucketKind = "week" | "month";
export function bucketKind(range: DateRange): BucketKind;                      // ≤ 92 days → week
export interface Bucket { key: string; label: string; title: string }          // week: key = Sunday date, label "Jun 28", title "Week of Jun 28"; month: key "2026-07", label "Jul", title "Jul 2026"
export function buckets(range: DateRange, kind: BucketKind): Bucket[];
export function bucketKeyOf(date: string, kind: BucketKind): string;
export const NOT_LINKED = "not-linked";
export const NO_SUBCATEGORY = "none";
export interface EnrichedSale extends SaleRow { item: CatalogItem | null; categoryId: string | null; subcategoryId: string | null }
export interface SaleFilters { range?: DateRange | null; categoryId?: string | null; subcategoryId?: string | null }
export function filterSales(sales: SaleRow[], catalog: Catalog, f: SaleFilters): EnrichedSale[]; // category/sub-category filters drop unlinked sales
export interface Totals { revenue: number; units: number; count: number; average: number }
export function summarize(sales: EnrichedSale[]): Totals;                      // units: linked sales only; average = revenue / count (0 when none)
export function delta(current: number, previous: number): number | null;     // fraction; null when previous is 0
export type Measure = "revenue" | "units";
export interface SeriesPoint { bucket: Bucket; values: Record<string, number>; total: number } // key = categoryId | NOT_LINKED
export function seriesOverTime(sales: EnrichedSale[], range: DateRange, kind: BucketKind, measure: Measure): SeriesPoint[];
export interface CategoryShare { key: string; name: string; revenue: number; units: number | null; share: number }
export function byCategory(sales: EnrichedSale[], catalog: Catalog): CategoryShare[];            // revenue desc, "Not linked" last
export interface SubcategoryRow { key: string; name: string; categoryId: string; revenue: number; units: number }
export function bySubcategory(sales: EnrichedSale[], catalog: Catalog): SubcategoryRow[];       // revenue desc; items without sub → key NO_SUBCATEGORY, name "No sub-category"
export interface ProductRow { key: string; name: string; categoryId: string | null; categoryName: string | null; subcategoryName: string | null; units: number | null; revenue: number; share: number; avgPrice: number | null; listPrice: number | null; onHand: number | null; lastSold: string; hidden: boolean; deleted: boolean; entries: number }
export function byProduct(sales: EnrichedSale[], catalog: Catalog, onHand: Map<string, number>): ProductRow[]; // revenue desc
export interface SizeRow { size: string; units: number; byCategory: Record<string, number> }
export function bySize(sales: EnrichedSale[]): SizeRow[];                     // linked, sized, not "One size"; MERCH_SIZES order; units > 0 only
export function bestSeller(rows: ProductRow[]): ProductRow | null;            // max units (linked), tie → revenue
export interface StockRow { itemId: string; size: string; quantity: number }
export interface StockAlert { itemId: string; name: string; size: string; quantity: number; status: "out" | "low"; sold: number }
export function stockAlerts(stock: StockRow[], catalog: Catalog, periodSales: EnrichedSale[], f: SaleFilters): StockAlert[]; // visible, non-deleted; out first, then sold desc, then name
export function stockTotals(stock: StockRow[], catalog: Catalog, f: SaleFilters): { units: number; value: number };        // non-deleted; value = Σ qty × price
export const CATEGORY_COLORS: readonly string[]; export const OTHER_COLOR: string;
export function categoryColors(categories: { id: string; createdAt: string }[]): Map<string, string>; // createdAt asc (tie: id); first 8 slots
export function colorFor(key: string, colors: Map<string, string>): string;       // unknown / NOT_LINKED → OTHER_COLOR
```

- [ ] **Step 1: Write the failing tests** (today `2026-09-27`).
  - **`resolveRange`:**
    - this-month → `2026-09-01..27`;
    - last-30 → `08-29..09-27`;
    - last-3-months → `06-28..09-27`, and for today `2026-05-31` → `03-01..05-31`;
    - this-year → `01-01..`;
    - all with earliest `2025-11-02` → `2025-11-02..`, and with no sales → `today..today`;
    - custom with from > to is swapped.
  - **`previousRange`:** `06-28..09-27` (92 days) → `03-28..06-27`; leap `2028-03-01..03-31` → `2028-01-30..02-29`.
  - **`bucketKind`:** 92 days → week; 93 → month.
  - **`buckets`:** week buckets for `06-28..09-27` → 14 buckets, the first key `2026-06-28` (Sunday); a range `2026-12-30..2027-01-10` crosses the year with Sunday keys `2026-12-27`, `2027-01-03`, `2027-01-10`; month buckets for `2026-01-15..2026-04-02` → `2026-01..04`.
  - **`filterSales`:** date bounds inclusive; category filter drops unlinked; sub-category filter; deleted items kept.
  - **`summarize` / `delta`:** unlinked counts in revenue and count but not units; `delta(120,100)=0.2`; `delta(5,0)=null`.
  - **`seriesOverTime`:** zero-filled buckets; units measure omits NOT_LINKED.
  - **`byCategory`:** order; "Not linked" last; shares sum to 1.
  - **`bySubcategory`:** legacy item → "No sub-category".
  - **`byProduct`:** avg price 16200/14 → 1157.14; listPrice; deleted flag; NOT_LINKED row; lastSold = max date.
  - **`bySize`:** excludes "One size" and null sizes; canonical order.
  - **`bestSeller`:** tie broken by revenue.
  - **`stockAlerts`:** hidden products excluded; out before low; ties by sold.
  - **`stockTotals`:** value.
  - **`categoryColors`:** creation order; 9th → no entry → `colorFor` gives grey.
- [ ] **Step 2:** Run `npm test` and expect FAIL.
- [ ] **Step 3:** Implement `analytics.ts`, using `addDays`/`daysBetween` via a relative import `../utils/cairo-time` and the day of week via `new Date(`${d}T00:00:00Z`).getUTCDay()`.
- [ ] **Step 4:** Run `npm test` and expect PASS.
- [ ] **Step 5: Commit:** `feat(merch): analytics aggregation module`

### Task 4: Categories & stock in the app, and the new Products page (grid + product drawer)

**Files:**
- Modify: `src/types/database.ts` per spec §12, plus the `Functions` entries `merch_restock`, `merch_recount` and `merch_available_sizes`. Add convenience types `MerchCategoryRow` and `MerchStockRow`.
- Modify: `src/lib/config/merch.ts`:
  - **Types:** `MerchCategory`, `MerchSubcategory` (`category_id`), `MerchItemView` (admin, with `stock`), `MerchCatalogItem` / `MerchCatalogSize` (player).
  - **Mapping:** `MERCH_ITEM_SELECT`, `sortCategories`, `merchTypeLabel(categoryName, subName)`.
  - **Keep, marked `@deprecated`, for Finances until Task 7:** `MERCH_CATEGORIES` and `getMerchCategoryLabel`.
- Create: `src/lib/merch/views.ts` with `toMerchItemView(row, publicUrl)` and `toMerchCatalogItem(row, availability, publicUrl)`.
- Create: `src/app/(portal)/admin/merch/_lib/admin.ts` (server-only `assertAdmin()`, `revalidateMerch()`)
- Create: `src/app/(portal)/admin/merch/categories/actions.ts`. In this task it contains only `createMerchSubcategory(categoryId, name)`, moved from the merch actions; Task 6 adds the rest.
- Rewrite: `src/app/(portal)/admin/merch/actions.ts`: `createMerchItem`, `updateMerchItem` (size diff), `toggleMerchVisibility` and `deleteMerchItem`.
- Rewrite: `src/app/(portal)/admin/merch/page.tsx`
- Delete: `src/app/(portal)/admin/merch/_components/merch-admin-client.tsx`
- Create: `_components/products-client.tsx`, `_components/product-card.tsx`, `_components/product-drawer.tsx`
- Modify: `src/components/merch/merch-shared.tsx` (`MerchSizes` takes `MerchCatalogSize[]`; `MerchCategoryChips` and `countByCategory` are keyed by category id)
- Modify: `src/app/(portal)/player/merch/page.tsx`, `_components/merch-catalog-client.tsx` (RPC availability, DB categories)
- Modify: `src/components/layout/sidebar-layout.tsx` (Merch → Products / Categories / Analytics; icons `Tags` and `BarChart3`; keeps the uncommitted player rename)

**Interfaces (produces):**
```ts
// admin/merch/_lib/admin.ts
export async function assertAdmin(): Promise<{ error: string; supabase: null; userId: null } | { error: null; supabase: any; userId: string }>;
export function revalidateMerch(): void; // /admin/merch, /admin/merch/categories, /admin/merch/analytics, /admin/finances, /player/merch
// admin/merch/actions.ts  (FormData: id?, name, category_id, subcategory_id, price, description, is_active, image, sizes[], stock_<size>)
export async function createMerchItem(fd: FormData): Promise<{ error: string } | { success: true; id: string }>;
export async function updateMerchItem(fd: FormData): Promise<{ error: string } | { success: true }>;
export async function toggleMerchVisibility(id: string, isActive: boolean): Promise<{ error: string } | { success: true }>;
export async function deleteMerchItem(id: string): Promise<{ error: string } | { success: true }>;
// admin/merch/categories/actions.ts
export async function createMerchSubcategory(categoryId: string, name: string): Promise<{ error: string } | { success: true; subcategory: MerchSubcategory }>;
// products-client props
{ items: MerchItemView[]; categories: MerchCategory[]; subcategories: MerchSubcategory[] }
```

**Behaviour:**
- **Page:** spec §4 (tiles, filters, grid).
- **Product drawer:** spec §6 (create, edit, duplicate, save & add another, size diff with a confirm on removing a size that has stock, read-only counts on edit).
- **Stock chips:** render in this task. They and the **Stock** / **Sell** buttons call `onStock(item)` and `onSell(item)` props, which are no-ops until Tasks 5 and 6.
- **Player:** spec §11.

- [ ] **Step 1:** Types + config + views + shared components.
- [ ] **Step 2:** Admin helpers + actions.
- [ ] **Step 3:** Products page and card.
- [ ] **Step 4:** Product drawer.
- [ ] **Step 5:** Player catalog + nav.
- [ ] **Step 6: Verify.** `npx tsc --noEmit`: the only errors allowed are in `src/app/(portal)/admin/finances/**` and `src/app/_actions/income.ts` (fixed in Task 7). Then `npm test` and `npm run lint`.
- [ ] **Step 7: Commit:** `feat(merch): card-grid products page, categories and stock from the database`

### Task 5: Stock drawer (Restock / Recount)

**Files:**
- Create: `_components/stock-drawer.tsx`
- Modify: `admin/merch/actions.ts`, adding `restockMerch` and `recountMerch`
- Modify: `products-client.tsx`, wiring `onStock` and `?restock=<id>`

**Interfaces:**
```ts
export async function restockMerch(itemId: string, added: Record<string, number>): Promise<{ error: string } | { success: true }>;
export async function recountMerch(itemId: string, changes: RecountChange[]): Promise<{ error: string } | { success: true; ok: boolean; stock: Record<string, number> }>;
// <StockDrawer item={MerchItemView | null} open onClose onSaved={(msg: string) => void} />
```

**Behaviour:** spec §5.
- Restock sums with `restockTotal`.
- Recount diffs with `recountChanges`.
- On `ok:false`, "In stock" is replaced by the returned counts, typed counts are kept, the banner shows, and rows that changed underneath are highlighted.

- [ ] **Step 1:** Actions (validate integers ≥ 0 client- and server-side).
- [ ] **Step 2:** Drawer UI.
- [ ] **Step 3:** Wiring, plus the `restock` search param opening the drawer on load.
- [ ] **Step 4:** `npx tsc --noEmit` (same allowed Finances errors) + `npm run lint`.
- [ ] **Step 5: Commit:** `feat(merch): restock and recount stock panel`

### Task 6: Sale drawer + Categories page

**Files:**
- Create: `_components/sale-drawer.tsx`
- Modify: `admin/merch/actions.ts`, adding `recordMerchSale`
- Modify: `products-client.tsx`, wiring the header **Record sale** and the card **Sell**
- Modify: `admin/merch/categories/actions.ts`, adding `createMerchCategory`, `renameMerchCategory`, `deleteMerchCategory`, `moveMerchCategory`, `renameMerchSubcategory` and `deleteMerchSubcategory`
- Create: `admin/merch/categories/page.tsx`, `categories/_components/categories-client.tsx`

**Interfaces:**
```ts
export async function recordMerchSale(input: { itemId: string; size: string; quantity: number; amount: number; date: string; note: string }):
  Promise<{ error: string } | { success: true; remaining: number | null }>;
export async function createMerchCategory(name: string): Promise<{ error: string } | { success: true }>;
export async function renameMerchCategory(id: string, name: string): Promise<{ error: string } | { success: true }>;
export async function deleteMerchCategory(id: string): Promise<{ error: string } | { success: true }>;
export async function moveMerchCategory(id: string, direction: "up" | "down"): Promise<{ error: string } | { success: true }>;
export async function renameMerchSubcategory(id: string, name: string): Promise<{ error: string } | { success: true }>;
export async function deleteMerchSubcategory(id: string): Promise<{ error: string } | { success: true }>;
```

**Behaviour:** spec §7 (sale), §9 (categories), and the error table.
- `recordMerchSale` looks up the `is_merch` income category, inserts the `income` row, and returns the trigger's message as `{ error }`.
- The drawer calls `router.refresh()` on `MS001`/`MS002`.

- [ ] **Step 1:** `recordMerchSale` + the sale drawer + wiring.
- [ ] **Step 2:** Category actions (`23505` and `23503` mapped to friendly messages).
- [ ] **Step 3:** Categories page UI.
- [ ] **Step 4:** `npx tsc --noEmit` (same allowed Finances errors) + `npm run lint`.
- [ ] **Step 5: Commit:** `feat(merch): record sales and manage categories`

### Task 7: Finances — sizes, stock limits, DB categories

**Files:**
- Modify: `src/app/(portal)/admin/finances/_components/types.ts`:
  - `MerchOption` gets `category_id`, `category_name` and `stock: MerchStockLevel[]`;
  - `IncomeRow` gets `merch_size`, and `merch_items.merch_categories`.
- Modify: `src/app/(portal)/admin/finances/page.tsx` (queries; export with category name + a Size column)
- Modify: `src/app/(portal)/admin/finances/_components/income-drawer.tsx`:
  - cascade by `category_id` (options built from items, A→Z);
  - size chips with "N left" (disabled at 0 unless it's the edited sale's size);
  - quantity max from `maxSellable`;
  - sends `merch_size`.
- Modify: `src/app/(portal)/admin/finances/_components/income-table.tsx` (`merchPath` with size)
- Modify: `src/app/_actions/income.ts`:
  - `parseIncomeForm` reads `merch_size`;
  - a linked item requires size and qty;
  - revalidates the merch paths too.
- Modify: `src/lib/config/merch.ts` (delete the deprecated `MERCH_CATEGORIES` and `getMerchCategoryLabel`)

- [ ] **Step 1:** Types + page queries/export.
- [ ] **Step 2:** Drawer + table.
- [ ] **Step 3:** Income action.
- [ ] **Step 4:** Remove the deprecated exports.
- [ ] **Step 5:** `npx tsc --noEmit` should be clean, then `npm run lint` and `npm test`.
- [ ] **Step 6: Commit:** `feat(finances): merch sales record a size and respect stock`

### Task 8: Analytics page

**Files:**
- Create: `src/app/(portal)/admin/merch/analytics/page.tsx`. It is the server loader: sales paged by 1000, catalog including deleted items, categories, sub-categories, stock and `cairoToday()`.
- Create: `analytics/_components/analytics-client.tsx` (filters + tiles + layout)
- Create: `analytics/_components/sales-over-time.tsx` (recharts stacked `BarChart`; custom `shape` for the rounded top and 2px gap; Revenue/Units and Chart/Table)
- Create: `analytics/_components/breakdowns.tsx` (category share bar + list, sub-category bars, size columns; each with a Chart/Table switch)
- Create: `analytics/_components/stock-alerts.tsx`, `analytics/_components/product-table.tsx` (sortable), `analytics/_components/hover-tip.tsx`

**Behaviour:** spec §10, matching `.superpowers/brainstorm/…/analytics-page.html`. All numbers come from `src/lib/merch/analytics.ts`.

- [ ] **Step 1:** Loader + client shell with filters and tiles.
- [ ] **Step 2:** Sales over time.
- [ ] **Step 3:** Breakdowns.
- [ ] **Step 4:** Stock alerts + product table.
- [ ] **Step 5:** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- [ ] **Step 6: Commit:** `feat(merch): analytics page`

### Task 9: Verification & wrap-up

- [ ] **Step 1:** Full checks: `npm test`, `bash scripts/db/test-merch-stock.sh staging`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] **Step 2: Staging click-through.** Use the spec's Testing §3 list. It needs the staging publishable key in `.env.staging`; if it's still missing, report that it's blocked rather than pointing the app at prod.
- [ ] **Step 3:** Whole-branch review, using superpowers:requesting-code-review.
- [ ] **Step 4:** Report to the user. **Don't push or open a PR without asking,** because that's outward-facing.
