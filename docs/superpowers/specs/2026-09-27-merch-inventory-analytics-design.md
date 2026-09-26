# Merch Inventory, Categories & Analytics — Design

**Date:** 2026-09-27
**Status:** Approved
**Branch:** `feat/merch-inventory-analytics`, cut from `feat/merch-catalog`

## Summary

Turn the merch catalog into a small inventory and sales tool for admins:

- **Per-size stock** that sales deduct automatically. Overselling is refused.
- A reworked **Products** page (card grid) with quick **Restock / Recount** and **Record sale**.
- A **Categories** page where categories and sub-categories are created, renamed,
  reordered and (when unused) deleted, replacing today's hardcoded list.
- A **Merch Analytics** page: revenue, units, sales and average sale with period
  deltas, sales over time, and breakdowns by category, sub-category, product and size,
  plus stock alerts.
- Players see sold-out sizes crossed out and "Sold out" set automatically. They never
  see counts.

Sales remain ordinary **Merch income** rows, so Finances, its Excel export and
Analytics all read one source of truth.

## Decisions (settled during brainstorming)

1. **Stock is counted per size.** "One size" products have a single count.
2. **Sales deduct stock automatically.** Editing a sale moves stock, and deleting a
   sale gives it back.
3. **Overselling is blocked,** not warned.
4. **Sales can be recorded from the Merch page and from Finances.** Both write the
   same income row.
5. **One product per sale.** A "Save & sell another" button covers multi-item
   purchases (no basket).
6. **Stock is kept in step by a database trigger** (approach A). App-side
   check-then-write and a stock-history ledger were rejected.
7. **Products page layout is a card grid** (option B), not a table.
8. **Stock editing uses a panel with Restock and Recount tabs** (option B).
   - Restock adds what arrived.
   - Recount sets exact counts, but only if nothing changed since the panel opened.
9. **Analytics includes everything offered:** sales over time, by category, by size,
   and stock alerts, on top of per-product and per-sub-category.
10. **Colour means category** on the Analytics page. Colours follow the category (by
    creation order), never its position.
11. **Players get yes/no availability** from a database function. They cannot read
    the stock table.
12. **One migration.** Merch isn't live on prod (`main` has none of it), so old
    columns are dropped straight away. No clean-up migration is needed.

## Existing context (verified)

**Current merch code** (branch `feat/merch-catalog`, commit `c5b96271`, by jj1005, not
merged):

- **Migrations** `20260926000000`–`20260926300000`:
  - `merch_items` has `category` (text + CHECK), `sizes TEXT[]`, `is_sold_out`,
    `is_active`, `deleted_at`, and `subcategory_id` (nullable).
  - `merch_subcategories` has `category` (text).
  - `income` has `merch_item_id` (FK, ON DELETE SET NULL) and `merch_quantity`.
  - `income_categories` has `is_merch` (the seeded "Merch" category).
- **Hardcoded categories** are `MERCH_CATEGORIES` in `src/lib/config/merch.ts`. They
  are used by:
  - `merch-shared.tsx` (chips and counts);
  - the Finances income drawer, income table and Excel export.
- **Admin page:** `src/app/(portal)/admin/merch/` (`page.tsx`, `actions.ts`,
  `_components/merch-admin-client.tsx`).
  - Deleting a product with income is a soft delete (`deleted_at`).
- **Player page:** `src/app/(portal)/player/merch/` (`page.tsx`, `merch-catalog-client.tsx`).
- **Finances** (`src/app/(portal)/admin/finances/`):
  - The page loads merch items client-side.
  - `income-drawer.tsx` has a category → sub-category → item picker, quantity, and
    amount = price × qty.
  - `_actions/income.ts` `parseIncomeForm` reads `merch_item_id` and `merch_quantity`.
  - `deleteIncome` is a **soft delete** (`is_active = false`).
- **Types:** `src/types/database.ts` is hand-maintained ("Manual placeholder until
  Supabase CLI generates them").
- **Charts:** recharts. `admin/dashboard/_components/income-by-package.tsx` already
  uses the validated categorical palette (`#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4`),
  `OTHER #a8a59d`, axis text `#5A6B73`, and grid `#ECE8DF`.
- **Cairo dates:** `src/lib/utils/cairo-time.ts` provides `cairoToday()`, `addDays()`
  and `daysBetween()`. `income.income_date` is a `DATE`, so no timezone maths is needed
  on it.
- **No test runner.** `tsx` (^4.21) is a dev dependency and Node is v20.19, so
  `tsx --test` runs Node's built-in runner on TypeScript with no new packages.
- **Tooling:** Docker is available. `scripts/db/lib.sh` already runs psql in Docker
  against `scripts/db/.env.db` URLs.
- **Data on prod** (staging is a same-day clone):
  - 1 live product: "Beachamp Black Hoodie" (Apparel/Hoodie, S–XL, visible).
  - 1 soft-deleted test "Hoodie" with no sub-category.
  - Sub-categories "Hoodie" and "Tshirt" (Apparel).
  - 2 merch-linked income rows, both soft-deleted and without sizes.

## Architecture

### 1. Database — `supabase/migrations/20260927000000_merch_inventory.sql`

```sql
-- ── Categories become rows ──────────────────────────────────────────────
CREATE TABLE merch_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (btrim(name) <> ''),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_merch_categories_name ON merch_categories (lower(name));

-- Distinct created_at per row: chart colours are assigned in creation order
INSERT INTO merch_categories (name, sort_order, created_at) VALUES
  ('Apparel',     0, NOW()),
  ('Accessories', 1, NOW() + INTERVAL '1 microsecond'),
  ('Equipment',   2, NOW() + INTERVAL '2 microseconds');

ALTER TABLE merch_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view merch categories"
  ON merch_categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage merch categories"
  ON merch_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Sub-categories: text category → category_id
ALTER TABLE merch_subcategories
  ADD COLUMN category_id UUID REFERENCES merch_categories(id) ON DELETE RESTRICT;
UPDATE merch_subcategories s SET category_id = c.id
  FROM merch_categories c WHERE lower(c.name) = s.category;
ALTER TABLE merch_subcategories ALTER COLUMN category_id SET NOT NULL;
DROP INDEX idx_merch_subcategories_unique;
ALTER TABLE merch_subcategories DROP COLUMN category;
CREATE UNIQUE INDEX idx_merch_subcategories_unique ON merch_subcategories (category_id, lower(name));
ALTER TABLE merch_subcategories ADD CONSTRAINT merch_subcategories_id_category UNIQUE (id, category_id);

-- Items: text category → category_id; an item's sub-category must sit in the item's category
ALTER TABLE merch_items
  ADD COLUMN category_id UUID REFERENCES merch_categories(id) ON DELETE RESTRICT;
UPDATE merch_items i SET category_id = c.id
  FROM merch_categories c WHERE lower(c.name) = i.category;
ALTER TABLE merch_items ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE merch_items DROP COLUMN category;
ALTER TABLE merch_items DROP CONSTRAINT merch_items_subcategory_id_fkey;
ALTER TABLE merch_items ADD CONSTRAINT merch_items_subcategory_fkey
  FOREIGN KEY (subcategory_id, category_id)
  REFERENCES merch_subcategories (id, category_id) ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_merch_items_category ON merch_items (category_id);

-- ── Stock per product and size ──────────────────────────────────────────
CREATE TABLE merch_stock (
  item_id     UUID NOT NULL REFERENCES merch_items(id) ON DELETE CASCADE,
  size        TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, size)
);
-- Every size offered today starts at 0; admins enter real counts with Recount
INSERT INTO merch_stock (item_id, size)
  SELECT DISTINCT i.id, s.size FROM merch_items i CROSS JOIN LATERAL unnest(i.sizes) AS s(size);
ALTER TABLE merch_items DROP COLUMN sizes, DROP COLUMN is_sold_out;

ALTER TABLE merch_stock ENABLE ROW LEVEL SECURITY;
-- Admins only: players learn availability through merch_available_sizes(), never counts
CREATE POLICY "Admins can manage merch stock"
  ON merch_stock FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Sales carry a size ──────────────────────────────────────────────────
ALTER TABLE income ADD COLUMN merch_size TEXT;
-- New/edited product-linked sales must say which size and how many (older rows are exempt)
ALTER TABLE income ADD CONSTRAINT income_merch_sale_complete
  CHECK (merch_item_id IS NULL OR (merch_size IS NOT NULL AND merch_quantity IS NOT NULL)) NOT VALID;
```

The same migration also creates the trigger and three functions below.

### 2. Stock rules in the database

**Trigger `income_merch_stock`**: `AFTER INSERT OR UPDATE OR DELETE ON income FOR EACH ROW`,
calling `apply_merch_sale_to_stock()` (plpgsql, security invoker).

- A row version "counts" when `is_active AND merch_item_id IS NOT NULL AND merch_size IS NOT NULL`.
- **UPDATE with the same product, size and quantity:** does nothing. Edits to amount,
  date or notes never touch stock.
- **Give back the old version** (UPDATE/DELETE, when OLD counts):
  - `quantity + OLD.merch_quantity` for that size.
  - If the size row no longer exists, it's skipped, rather than re-adding a size the
    product dropped.
- **Take the new version** (INSERT/UPDATE, when NEW counts):
  - `UPDATE merch_stock SET quantity = quantity - NEW.merch_quantity WHERE item_id = … AND size = … AND quantity >= NEW.merch_quantity`.
  - The UPDATE's row lock serialises concurrent sales of the same size.
  - If no row is updated:
    - Row missing: `RAISE EXCEPTION '% no longer comes in %' USING ERRCODE = 'MS002'`.
    - Row at 0: `'No % left of %'` (size, product), `ERRCODE 'MS001'`.
    - Otherwise: `'Only % × % left of %'` (count, size, product), `ERRCODE 'MS001'`.
- Giving back before taking means that editing M×2 to M×3 needs only 1 more M in stock.
  "Up to stock + this sale's own quantity" falls out of the order.
- Soft delete (`is_active` true → false) is an UPDATE where only OLD counts, so stock
  is given back.

**`merch_restock(p_item_id UUID, p_added JSONB) RETURNS VOID`** (security invoker):

- `p_added` is `{"M": 10, "L": 5}`. Each value is an integer ≥ 0; 0 is skipped.
  Negative raises `MS003`.
- Each size gets `quantity + n`. An unknown size raises `MS002` ("This product doesn't
  come in %").
- One function call is one transaction, so a restock applies to all sizes or none.

**`merch_recount(p_item_id UUID, p_counts JSONB) RETURNS JSONB`** (security invoker):

- `p_counts` is `[{"size":"XL","expected":2,"counted":1}, …]`, holding only the sizes
  the admin changed.
- The product's stock rows are locked first (`SELECT … FOR UPDATE`).
- Each entry is validated: `counted` must be ≥ 0 (`MS003`), and the size must exist
  (`MS002`).
- If any size's current quantity differs from `expected`, nothing is written.
- Otherwise every `quantity = counted` is written.
- The function returns `{"ok": <nothing was stale>, "stock": {"S":4,…}}` with the
  current counts either way, so the panel can refresh.

**`merch_available_sizes() RETURNS TABLE (item_id UUID, size TEXT, in_stock BOOLEAN)`**:

- `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`.
- Returns sizes of products where `is_active AND deleted_at IS NULL`, only when
  `auth.uid() IS NOT NULL`.
- `REVOKE EXECUTE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.

`merch_restock` and `merch_recount` are also revoked from `PUBLIC, anon` and granted
to `authenticated`. RLS on `merch_stock` makes them no-ops for non-admins, and server
actions check the admin role first anyway.

### 3. Admin navigation (`src/components/layout/sidebar-layout.tsx`)

Merch section: **Products** `/admin/merch` (key `merch`, `Shirt`) · **Categories**
`/admin/merch/categories` (key `merch-categories`, `Tags`) · **Analytics**
`/admin/merch/analytics` (key `merch-analytics`, `BarChart3`).

The existing longest-prefix match highlights the right item. The player nav keeps
**Merch → Products** (already renamed; that change is uncommitted in the working tree
and ships with this branch).

### 4. Products page (`/admin/merch`)

The server loads:
- non-deleted items with `merch_categories(name)`, `merch_subcategories(name)` and
  `merch_stock(size, quantity)`;
- all categories (by `sort_order`, then `created_at`) and sub-categories.

The client (`products-client.tsx`, with `product-card.tsx`) renders:

- **Header:** "Products" + subtitle, with **Record sale** (ghost) and **+ New product**.
- **Stat tiles:**
  - Products (plus how many are visible).
  - Units in stock (all non-deleted products).
  - Low stock, counting sizes at 1–2.
  - Sold out, counting sizes at 0.
  - Low and Sold out count **visible products only**, since hidden ones are being
    prepared or retired.
- **Filter row:**
  - Search (name, sub-category).
  - Category chips with counts (all categories, including empty ones).
  - Stock select: *All · Low or out · Hidden from players*.
- **Card grid** (2 / 3 / 4 columns). Each card has:
  - photo, name, "Category · Sub-category" and price;
  - **stock chips** per size ("S 4"), in canonical `MERCH_SIZES` order, amber at 1–2,
    red at 0; clicking a chip opens the Stock drawer;
  - footer: visibility switch, **Stock** and **Sell**;
  - an edit pencil at top-right;
  - a "Sold out" badge on the photo when every size is 0.
- **Empty state:** as today, reworded "Add your first product".

`LOW_STOCK_THRESHOLD = 2` lives in `src/lib/config/merch.ts`.

### 5. Stock drawer (`stock-drawer.tsx`)

The title is "Update stock", with the product name below. There are two tabs:

- **Restock:**
  - Rows: Size · In stock · **Arrived** (number, empty = 0) · After.
  - Footer: "+N units" and **Add to stock**, disabled at 0.
  - Saves via `restockMerch(itemId, added)`, which calls `merch_restock`.
- **Recount:**
  - Rows: Size · In stock · **Counted** (prefilled with current) · Change (±, green/red).
  - Footer: **Save counts**, disabled when nothing changed.
  - Saves via `recountMerch(itemId, counts)`, which calls `merch_recount` with
    `{size, expected, counted}` for changed sizes only.
  - On `ok:false`, the "In stock" column refreshes from the returned counts, typed
    counts are kept, and changed rows are highlighted. The banner reads "Stock changed
    while you were counting (a sale was recorded). Check your counts and save again."

It opens from a card's **Stock** button or a stock chip, from **Update stock** in the
edit drawer, and from **Restock** in Analytics' stock alerts (a link to
`/admin/merch?restock=<itemId>`, which opens the drawer).

### 6. Product drawer (`product-drawer.tsx`): create, edit, duplicate

**Fields:**
- Photo (drop / click, PNG/JPG/WebP ≤ 5MB, as today) and name.
- Category (from DB) and sub-category (from DB, filtered by category, with inline
  **+ New** as today).
- Price (EGP).
- **Sizes & opening stock:** size chips; each selected size gets a count box.
- Description.
- **Show in player catalog** switch.

**Create:**
- Footer: Cancel · **Save & add another** (keeps the drawer open and the category) ·
  **Create product**.
- The server inserts the item, then its `merch_stock` rows. If the stock insert fails,
  the item and uploaded photo are deleted and the error is returned.

**Edit:**
- Existing sizes show their current count **read-only**, with an **Update stock** link
  to the Stock drawer.
- A newly ticked size gets an opening-count box and is inserted.
- Unticking a size with stock > 0 asks "XL still has 1 in stock. Remove anyway?" and
  deletes that row.
- Existing counts are never written by this form.
- Extra actions: **Duplicate** and **Delete** (existing soft/hard delete logic; stock
  rows cascade on hard delete).

**Duplicate:** opens the drawer in create mode, prefilled with name ("Copy of …"),
category, sub-category, price, sizes and description. There's no photo, and opening
counts are empty.

**Validation:** name; category; sub-category in that category (the composite FK is the
backstop); price ≥ 0; at least one size; opening counts are integers ≥ 0.

### 7. Sale drawer (`sale-drawer.tsx`)

- **Product:**
  - From a card's **Sell**, it's prefilled, with a **Change** link.
  - From the header's **Record sale**, it starts with a search list of non-deleted
    products showing thumb, name and "N in stock". Hidden products are tagged, and
    fully sold-out ones are disabled.
- **Size:** chips showing "N left". Sizes at 0 are disabled and struck through
  ("none left").
- **Quantity:** stepper from 1 to the chosen size's stock.
- **Amount (EGP):** price × qty, kept in step until the admin edits it (the existing
  `amountAuto` pattern), with the hint "1,200 × 2 · edit for a discount".
- **Date:** `DatePicker`, default `cairoToday()`.
- **Note (optional):** e.g. the buyer's name. It's saved as the income `description`.
- **Preview line:** "After this sale: L stock 7 → 5".
- **Footer:** Cancel · **Save & sell another** (resets to the product picker) ·
  **Record sale · N EGP**.
- The server action `recordMerchSale` inserts an `income` row:
  - `category_id` = the `is_merch` income category; if none is active, the error is
    "Set up the Merch income category in Finances first";
  - `amount`, `income_date`, `description`;
  - `merch_item_id`, `merch_size`, `merch_quantity`, `created_by`.
- The trigger deducts stock. On success the toast reads "Sold 2 × L Beachamp Black
  Hoodie · 5 L left".

### 8. Finances changes

- **Page:** loads merch items with `category_id`, `merch_categories(name)`,
  `merch_subcategories(name)` and `merch_stock(size, quantity)`. Income rows now also
  carry `merch_size` and the item's category name.
- **`income-drawer.tsx`:**
  - The merch cascade is category (from DB) → sub-category → product → **size chips
    with "N left"** → quantity.
  - Max quantity = stock for that size, plus the entry's original quantity when
    editing the same product and size.
  - It sends `merch_size`.
- **`_actions/income.ts`:**
  - `parseIncomeForm` reads `merch_size`.
  - A linked product requires a size and a quantity ≥ 1.
  - Trigger errors are returned as their message.
- **`income-table.tsx`:** the merch line reads "Apparel › Hoodie › Beachamp Black
  Hoodie · L ×2".
- **Excel export:** "Merch Category" becomes the category name, and a "Size" column is
  added.
- Editing a legacy linked sale (no size) requires picking a size, which then deducts
  stock. Only 2 such rows exist, both soft-deleted.

### 9. Categories page (`/admin/merch/categories`)

The server loads categories, sub-categories and, per sub-category, the counts of
non-deleted and deleted products.

The client (`categories-client.tsx`) shows one card per category:
- **Header:** ▲▼ (reorder), name + "N sub-categories · N products", ✎ (rename), and 🗑
  (only when deletable).
- **Sub-category rows:** name, "N products" / "no products" / "past sales only" (only
  deleted products use it), ✎ and 🗑 (only when deletable).
- An "+ Add sub-category" row.
- **Everything is edited in place:** rename becomes an input with ✓/✕, Enter saves and
  Esc cancels.
- A header button **+ New category**.
- An explainer line: rename is always allowed; delete only when nothing uses it; ▲▼
  sets the order of the player's category chips.

**Rules:**
- A sub-category is deletable iff no `merch_items` row (including deleted ones)
  references it.
- A category is deletable iff it has no sub-categories and no items.
- The FK `ON DELETE RESTRICT` is the backstop. Its error becomes "Can't delete: N
  products use it".

**Actions** (`categories/actions.ts`, admin-checked):
- `createMerchCategory(name)`, which sets `sort_order` = max + 1;
- `renameMerchCategory`, `deleteMerchCategory`;
- `moveMerchCategory(id, 'up'|'down')`, which swaps `sort_order` with the neighbour;
- `createMerchSubcategory(categoryId, name)`, `renameMerchSubcategory`,
  `deleteMerchSubcategory`.

A unique violation (`23505`) returns "Hoodie already exists in Apparel" / "Apparel
already exists". Every action revalidates `/admin/merch`, `/admin/merch/categories`,
`/admin/merch/analytics`, `/admin/finances` and `/player/merch`.

### 10. Analytics page (`/admin/merch/analytics`)

**Server load:**
- **Sales:** active `income` rows where `merch_item_id IS NOT NULL` or the category is
  an `is_merch` income category (`.or(...)`). Columns: `id, income_date, amount,
  merch_item_id, merch_size, merch_quantity`.
  - Fetched in pages of 1000 (PostgREST's row cap) until exhausted.
- **Catalog:** all items including deleted (`id, name, price, category_id,
  subcategory_id, is_active, deleted_at`), categories, and sub-categories.
- **Stock:** stock rows for non-deleted items.
- **Dates:** `cairoToday()`.

The client (`analytics-client.tsx`) holds the filters. All numbers come from pure
functions in **`src/lib/merch/analytics.ts`**.

- **Filter row** (one row, scopes everything):
  - **Date range:** This month · Last 30 days · **Last 3 months** (default) · This
    year · All time · Custom (two `DatePicker`s).
  - **Category:** segmented control.
  - **Sub-category:** select, limited to the chosen category.
  - "Changes are vs the previous N".
  - The **previous period** is the same number of days immediately before the start.
    All time has no deltas.
- **Headline tiles:**
  - Revenue, Units sold, Sales (row count) and Average sale (revenue ÷ sales), each
    with a signed delta ("▲ 18% vs prev.", green for up and red for down). If the
    previous value is 0, the delta shows "—".
  - Best seller: most units, ties broken by revenue; hidden when there are no sales.
- **Sales over time** (recharts):
  - Stacked columns by category, with a Revenue | Units switch (one axis at a time,
    never dual-axis) and a Chart | Table switch.
  - Buckets: ranges up to 92 days use **weeks starting Sunday** (label "Week of Jun
    28"); longer ranges use months ("Jul 2026").
  - Marks: columns ≤ 24px, 4px rounded top on the topmost non-zero segment (custom
    `shape`), 2px surface gap between segments, hairline `#ECE8DF` grid.
  - Tooltip: the value leads, with line keys.
  - Units mode leaves out "Not linked" sales, which have no units.
- **By category:**
  - A 100% share bar (2px gaps; square left end, 4px rounded right end).
  - A list per category: swatch, name, revenue, share %, units. "Not linked to a
    product" shows as grey, with "no units".
- **By sub-category:** horizontal bars sorted by revenue, coloured by category, with
  value at the tip ("16,200 · 14 units") and a legend.
- **By size:**
  - Units per size in `MERCH_SIZES` order, stacked by category, with value on the cap.
  - "One size" is excluded. Caption: "'One size' items are left out. Pick a
    sub-category to see one product type."
- **Stock alerts** (right now, not date-scoped, but following the category and
  sub-category filters):
  - Mini tiles: Units on hand, and Stock value at price (Σ quantity × price,
    non-deleted).
  - Rows for **visible** products with sizes at 0 ("Out", red x-circle icon) or 1–2
    ("Low", amber triangle icon), sorted out-first, then by units sold in the period,
    then by name.
  - Each row has a **Restock** link (§5).
  - Status is always icon + label, never colour alone.
- **By product** table (sortable, default revenue ↓):
  - Columns: Product (category dot, name, tags **Hidden** / **Deleted**, "Category ·
    Sub-category"), Units, Revenue, Share (inline bar + %), Avg price (with "list N"
    when it differs), On hand (– for deleted), Last sold.
  - A "Not linked to a product" row appears when present.
- **Colours** (`categoryColor(categories)` in `analytics.ts`):
  - Categories ordered by `created_at` take slots `#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300, #4a3aa7, #e34948`.
  - A 9th category onward, and "Not linked", use `#a8a59d`.
  - The first three slots pass the palette validator for all pairs on white; aqua's
    sub-3:1 contrast is covered by visible labels and table views.
- **Hover and accessibility:**
  - Every chart card has a Table switch.
  - HTML bars use a small shared hover tooltip that is keyboard-focusable.
  - Text uses ink colours, never series colours.
  - On phones: 2 tiles per row, cards stack, and the product table scrolls
    horizontally inside its card.
- **Sales without a product:** a category or sub-category filter leaves out "Not
  linked" sales (they have no category). A sale whose product has no sub-category
  groups under "No sub-category".

### 11. Player catalog (`/player/merch`)

- **Loads:**
  - visible, non-deleted items with category and sub-category names;
  - categories, with chips shown only for categories that have ≥ 1 visible product,
    in `sort_order`;
  - availability via `supabase.rpc('merch_available_sizes')`.
- **Sizes:** in-stock sizes render as today; out-of-stock sizes are struck through
  and muted (`aria-label="M, sold out"`).
- **Sold out:** a product with every size out gets the existing "Sold out" badge and
  greyscale photo, plus the "Currently sold out" drawer copy.
- Counts are never sent to the client.

### 12. Shared code and types

- **`src/lib/config/merch.ts`:**
  - Keeps `MERCH_SIZES` and adds `LOW_STOCK_THRESHOLD`.
  - Drops `MERCH_CATEGORIES`, `MerchCategory` (the old value union) and
    `getMerchCategoryLabel`.
  - New shapes: `MerchCategory {id, name, sort_order, created_at}`,
    `MerchSubcategory {id, category_id, name}`, `MerchItemView` (admin: category and
    sub-category ids and names, `stock: {size, quantity}[]`) and `MerchCatalogItem`
    (player: `sizes: {size, in_stock}[]`, `is_sold_out`).
- **`src/lib/merch/stock.ts`** (pure): `sortSizes`, `stockStatus(qty)` (out / low / ok),
  `stockSummary(stock)`, `maxSellable(stock, size, editing?)`.
- **`src/lib/merch/analytics.ts`** (pure): `resolveRange`, `previousRange`,
  `bucketKind`, `bucketize`, `filterSales`, `summarize`, `delta`, `seriesOverTime`,
  `byCategory`, `bySubcategory`, `byProduct`, `bySize`, `stockAlerts`, `stockTotals`,
  `categoryColor`.
- **`src/components/merch/merch-shared.tsx`:** `MerchSizes` takes availability;
  `MerchCategoryChips` and `countByCategory` take DB categories (by id).
- **`src/types/database.ts`** (hand-edited):
  - New tables: `merch_categories`, `merch_stock`.
  - Updated tables: `merch_items` (`category_id`; minus `category`, `sizes`,
    `is_sold_out`), `merch_subcategories` (`category_id`; minus `category`), `income`
    (`merch_size`).
  - New `Functions` entries for the three RPCs.

## Data flow

- **Sale** (Merch or Finances): server action → `income` insert → trigger takes stock
  (or raises) → revalidate `/admin/merch*`, `/admin/finances` and `/player/merch`.
- **Delete or edit a sale** (Finances): `income` update → trigger gives back the old
  version and takes the new one.
- **Restock / Recount:** server action → RPC → revalidate. A stale recount returns the
  current counts without writing anything.
- **Product save:** server action → item insert/update → stock row inserts/deletes for
  added/removed sizes only.
- **Analytics:** one server load → client-side filtering and aggregation (instant
  filter changes, no refetch).
- **Player catalog:** server load + `merch_available_sizes()`. Only booleans reach the
  page.

## Error handling

Nothing is saved when any of these errors occur. Messages appear inline in the open
drawer; other failures use the existing red toast.

| Situation | Message / behaviour |
|---|---|
| Sale exceeds stock (`MS001`) | "Only 1 × M left of Beachamp Black Hoodie" / "No M left of …"; size chips refresh (`router.refresh()`) |
| Size removed meanwhile (`MS002`) | "Beachamp Black Hoodie no longer comes in XXL"; drawer refreshes |
| Stale recount (`ok:false`) | Banner + refreshed "In stock" column, typed counts kept |
| Negative restock/recount (`MS003`) | Blocked in the UI first; server message as backstop |
| Delete in-use category/sub-category | Delete not offered; FK backstop → "Can't delete: N products use it" |
| Duplicate category/sub-category name | "Hoodie already exists in Apparel" |
| Remove a size that has stock | Confirm dialog first |
| No active Merch income category | "Set up the Merch income category in Finances first" |
| Stock rows fail after product insert | Product and photo rolled back; error shown |

## Testing

1. **Unit tests** (new `npm test` = `tsx --test src/lib/merch/*.test.ts`, no new
   packages):
   - `stock.test.ts`: statuses at 0/1/2/3; summary totals; `maxSellable` for a new
     sale and when editing the same or a different size.
   - `analytics.test.ts`:
     - each preset's range and previous period (month boundaries, leap day);
     - Sunday-week vs month bucketing at the 92-day edge;
     - filters (category, sub-category, date);
     - totals, deltas (including previous = 0), average sale and best seller;
     - by category/sub-category/product/size, including "Not linked", deleted
       products, products without a sub-category, and "One size" excluded;
     - stock alerts ordering, visible-only;
     - colour slots by `created_at` and the 9th-category fold.
2. **Database tests:** `scripts/db/test-merch-stock.sql`, run by
   `scripts/db/test-merch-stock.sh staging`. It uses psql in Docker via `lib.sh` and
   the whole script is inside `BEGIN … ROLLBACK`. Assertions:
   - sale deducts; soft delete gives back; edit M×2 → L×1 moves stock; edit M×2 → M×3
     needs only 1;
   - amount-only edit leaves stock untouched;
   - oversell raises `MS001` with the message; removed size raises `MS002`;
   - restock adds, and rejects negatives and unknown sizes;
   - recount writes when `expected` matches, and returns `ok:false` without writing
     when stale;
   - as an `authenticated` player (`SET LOCAL ROLE` + `request.jwt.claims`),
     `merch_stock` returns 0 rows while `merch_available_sizes()` returns booleans;
   - the composite FK rejects a sub-category from another category.
3. **Click-through on staging** (`npm run env:staging`; needs the staging publishable
   key in `.env.staging`):
   - add a product with opening stock; restock; recount, including a forced stale
     recount from a second tab;
   - sell from a card and from Record sale; try to oversell;
   - edit and delete a sale in Finances and watch stock;
   - categories CRUD and reorder;
   - Analytics filters and table views;
   - the player view of crossed-out and sold-out sizes.
4. **Before the PR:** `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Rollout

1. **Branch:** `feat/merch-inventory-analytics` from `feat/merch-catalog` (jj1005's
   unmerged branch). It carries the uncommitted sidebar rename.
2. **Staging:** apply the migration (`supabase db push --db-url "$STAGING_DB_URL"`, or
   psql via Docker plus a row in `supabase_migrations.schema_migrations`). Run the
   database tests, then click through.
3. **PR against `main`:** if `feat/merch-catalog` merges first, the PR shows only this
   work; otherwise it carries both.
4. **Prod:** apply the migration and deploy together; nothing live reads the merch
   tables before that. **Right after deploy, Recount the Beachamp Black Hoodie**, or
   players will see it as sold out. Optionally rename "Tshirt" to "T-shirt" on the
   Categories page.

## Implementation order (for the plan)

1. Migration, types, SQL tests (staging).
2. `src/lib/merch/stock.ts` + tests; categories from DB across player catalog,
   Finances and shared components; nav.
3. Categories page.
4. Products page, product drawer, stock drawer.
5. Sale drawer; Finances size picker, table and export.
6. `src/lib/merch/analytics.ts` + tests, then the Analytics UI.
7. Staging click-through, lint/typecheck/build, PR.

## Out of scope (YAGNI)

- Basket / multi-product sales. "Save & sell another" covers it.
- A stock movement history or audit log. It could be layered on the trigger later.
- Per-product low-stock thresholds, purchase costs and margins, suppliers, and
  purchase orders.
- Online ordering or payment by players.
- Custom size lists, or size lists per category (the fixed `MERCH_SIZES` stays).
- Moving a sub-category to another category from the UI (the FK already cascades if
  it's ever added).
- Low-stock notifications, and analytics CSV export (the Finances export already
  covers raw sales).

## Mockups

The approved screens from brainstorming are kept locally (gitignored) in
`.superpowers/brainstorm/37221-1790462239/content/`: `products-layout.html` (B chosen),
`stock-editor.html` (B chosen), `product-and-sale-forms.html` (A chosen),
`categories-page.html` and `analytics-page.html`.
