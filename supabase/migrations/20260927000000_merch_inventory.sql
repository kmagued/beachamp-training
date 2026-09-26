-- Merch inventory: editable categories, per-size stock that sales keep in step,
-- and yes/no availability for players without exposing counts.
-- Merch isn't live on production yet, so the old columns are dropped here directly.

-- ═══════════════════════════════════════
-- Categories become rows
-- ═══════════════════════════════════════

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
  ON merch_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage merch categories"
  ON merch_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Sub-categories: text category → category_id
ALTER TABLE merch_subcategories
  ADD COLUMN category_id UUID REFERENCES merch_categories(id) ON DELETE RESTRICT;

UPDATE merch_subcategories s SET category_id = c.id
  FROM merch_categories c
 WHERE lower(c.name) = s.category;

ALTER TABLE merch_subcategories ALTER COLUMN category_id SET NOT NULL;
DROP INDEX idx_merch_subcategories_unique;
ALTER TABLE merch_subcategories DROP COLUMN category;
CREATE UNIQUE INDEX idx_merch_subcategories_unique ON merch_subcategories (category_id, lower(name));
-- Target for the composite foreign key on merch_items below
ALTER TABLE merch_subcategories ADD CONSTRAINT merch_subcategories_id_category UNIQUE (id, category_id);

-- Items: text category → category_id; an item's sub-category must sit in the item's category
ALTER TABLE merch_items
  ADD COLUMN category_id UUID REFERENCES merch_categories(id) ON DELETE RESTRICT;

UPDATE merch_items i SET category_id = c.id
  FROM merch_categories c
 WHERE lower(c.name) = i.category;

ALTER TABLE merch_items ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE merch_items DROP COLUMN category;
ALTER TABLE merch_items DROP CONSTRAINT merch_items_subcategory_id_fkey;
ALTER TABLE merch_items ADD CONSTRAINT merch_items_subcategory_fkey
  FOREIGN KEY (subcategory_id, category_id)
  REFERENCES merch_subcategories (id, category_id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_merch_items_category ON merch_items (category_id);

-- ═══════════════════════════════════════
-- Stock per product and size
-- ═══════════════════════════════════════

CREATE TABLE merch_stock (
  item_id     UUID NOT NULL REFERENCES merch_items(id) ON DELETE CASCADE,
  size        TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, size)
);

-- Every size offered today starts at 0; admins enter real counts with Recount
INSERT INTO merch_stock (item_id, size)
SELECT DISTINCT i.id, s.size
  FROM merch_items i
 CROSS JOIN LATERAL unnest(i.sizes) AS s(size);

ALTER TABLE merch_items DROP COLUMN sizes, DROP COLUMN is_sold_out;

ALTER TABLE merch_stock ENABLE ROW LEVEL SECURITY;

-- Admins only: players learn availability through merch_available_sizes(), never counts
CREATE POLICY "Admins can manage merch stock"
  ON merch_stock FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ═══════════════════════════════════════
-- Sales carry a size and move stock
-- ═══════════════════════════════════════

ALTER TABLE income ADD COLUMN merch_size TEXT;

-- New and edited product-linked sales must say which size and how many (older rows are exempt)
ALTER TABLE income ADD CONSTRAINT income_merch_sale_complete
  CHECK (merch_item_id IS NULL OR (merch_size IS NOT NULL AND merch_quantity IS NOT NULL)) NOT VALID;

-- Keeps merch_stock in step with sales: an active, product-linked, sized income row holds
-- its units out of stock. Edits give back the old version before taking the new one, so
-- raising M×2 to M×3 needs only one more M. The UPDATE's row lock serialises concurrent
-- sales of the same size, and its quantity guard refuses an oversell.
CREATE OR REPLACE FUNCTION apply_merch_sale_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_counts BOOLEAN := FALSE;
  new_counts BOOLEAN := FALSE;
  have INTEGER;
  item_name TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_counts := OLD.is_active AND OLD.merch_item_id IS NOT NULL AND OLD.merch_size IS NOT NULL;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_counts := NEW.is_active AND NEW.merch_item_id IS NOT NULL AND NEW.merch_size IS NOT NULL;
  END IF;

  -- Only the amount, date or notes changed
  IF TG_OP = 'UPDATE' THEN
    IF old_counts AND new_counts
       AND OLD.merch_item_id = NEW.merch_item_id
       AND OLD.merch_size = NEW.merch_size
       AND OLD.merch_quantity = NEW.merch_quantity THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Give back the previous version. If that size was since removed from the product
  -- there is nowhere to put it back, so it's skipped rather than re-adding the size.
  IF old_counts THEN
    UPDATE merch_stock
       SET quantity = quantity + OLD.merch_quantity, updated_at = NOW()
     WHERE item_id = OLD.merch_item_id AND size = OLD.merch_size;
  END IF;

  IF new_counts THEN
    UPDATE merch_stock
       SET quantity = quantity - NEW.merch_quantity, updated_at = NOW()
     WHERE item_id = NEW.merch_item_id AND size = NEW.merch_size AND quantity >= NEW.merch_quantity;

    IF NOT FOUND THEN
      SELECT quantity INTO have FROM merch_stock WHERE item_id = NEW.merch_item_id AND size = NEW.merch_size;
      SELECT name INTO item_name FROM merch_items WHERE id = NEW.merch_item_id;
      IF have IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'MS002',
          MESSAGE = format('%s no longer comes in %s', item_name, NEW.merch_size);
      ELSIF have = 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'MS001',
          MESSAGE = format('No %s left of %s', NEW.merch_size, item_name);
      ELSE
        RAISE EXCEPTION USING ERRCODE = 'MS001',
          MESSAGE = format('Only %s %s %s left of %s', have, chr(215), NEW.merch_size, item_name);
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER income_merch_stock
  AFTER INSERT OR UPDATE OR DELETE ON income
  FOR EACH ROW EXECUTE FUNCTION apply_merch_sale_to_stock();

-- ═══════════════════════════════════════
-- Stock changes from the admin panel
-- ═══════════════════════════════════════

-- Adds what arrived, e.g. {"M": 10, "L": 5}. One call is one transaction: all sizes or none.
CREATE OR REPLACE FUNCTION merch_restock(p_item_id UUID, p_added JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  entry RECORD;
BEGIN
  FOR entry IN SELECT key AS size, value::INTEGER AS added FROM jsonb_each_text(p_added) LOOP
    IF entry.added < 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'MS003', MESSAGE = 'Arrivals can''t be negative';
    END IF;
    CONTINUE WHEN entry.added = 0;

    UPDATE merch_stock
       SET quantity = quantity + entry.added, updated_at = NOW()
     WHERE item_id = p_item_id AND size = entry.size;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'MS002',
        MESSAGE = format('This product doesn''t come in %s', entry.size);
    END IF;
  END LOOP;
END;
$$;

-- Sets exact counts after a shelf count, e.g. [{"size": "XL", "expected": 2, "counted": 1}].
-- If any size moved since the admin opened the panel (a sale came in), nothing is written;
-- either way the current counts come back so the panel can refresh.
CREATE OR REPLACE FUNCTION merch_recount(p_item_id UUID, p_counts JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  entry RECORD;
  current_qty INTEGER;
  stale BOOLEAN := FALSE;
  latest JSONB;
BEGIN
  -- Lock the product's stock so a sale can't land between the check and the write
  PERFORM 1 FROM merch_stock WHERE item_id = p_item_id FOR UPDATE;

  FOR entry IN SELECT * FROM jsonb_to_recordset(p_counts) AS x(size TEXT, expected INTEGER, counted INTEGER) LOOP
    IF entry.counted IS NULL OR entry.counted < 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'MS003', MESSAGE = 'Counts can''t be negative';
    END IF;

    SELECT quantity INTO current_qty FROM merch_stock WHERE item_id = p_item_id AND size = entry.size;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'MS002',
        MESSAGE = format('This product doesn''t come in %s', entry.size);
    END IF;

    IF current_qty IS DISTINCT FROM entry.expected THEN
      stale := TRUE;
    END IF;
  END LOOP;

  IF NOT stale THEN
    UPDATE merch_stock s
       SET quantity = x.counted, updated_at = NOW()
      FROM jsonb_to_recordset(p_counts) AS x(size TEXT, expected INTEGER, counted INTEGER)
     WHERE s.item_id = p_item_id AND s.size = x.size;
  END IF;

  SELECT coalesce(jsonb_object_agg(size, quantity), '{}'::JSONB) INTO latest
    FROM merch_stock WHERE item_id = p_item_id;

  RETURN jsonb_build_object('ok', NOT stale, 'stock', latest);
END;
$$;

-- ═══════════════════════════════════════
-- Availability for players (yes/no only)
-- ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION merch_available_sizes()
RETURNS TABLE (item_id UUID, size TEXT, in_stock BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.item_id, s.size, s.quantity > 0
    FROM merch_stock s
    JOIN merch_items i ON i.id = s.item_id
   WHERE i.is_active AND i.deleted_at IS NULL AND auth.uid() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION merch_available_sizes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION merch_restock(UUID, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION merch_recount(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION merch_available_sizes() TO authenticated;
GRANT EXECUTE ON FUNCTION merch_restock(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION merch_recount(UUID, JSONB) TO authenticated;
