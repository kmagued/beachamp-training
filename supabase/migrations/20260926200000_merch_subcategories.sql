-- Merch hierarchy: category (apparel) → sub-category (hoodie) → item (Beachamp Black Hoodie).
-- Sub-categories are a shared list so sales can be totalled per item type.

CREATE TABLE merch_subcategories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL CHECK (category IN ('apparel', 'accessories', 'equipment')),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_merch_subcategories_unique ON merch_subcategories(category, lower(name));

ALTER TABLE merch_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view merch sub-categories"
  ON merch_subcategories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage merch sub-categories"
  ON merch_subcategories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Nullable so items created before this migration keep working until edited
ALTER TABLE merch_items
  ADD COLUMN subcategory_id UUID REFERENCES merch_subcategories(id) ON DELETE RESTRICT;

CREATE INDEX idx_merch_items_subcategory ON merch_items(subcategory_id);

-- Units sold, for merch income entries
ALTER TABLE income
  ADD COLUMN merch_quantity INTEGER CHECK (merch_quantity > 0);
