-- Merch catalog items act as sub-categories of the Merch income category.
-- Income logged under Merch can point at the catalog item that was sold.

ALTER TABLE income_categories
  ADD COLUMN is_merch BOOLEAN NOT NULL DEFAULT FALSE;

-- Flag the seeded Merch category (create it if it was removed or never seeded)
INSERT INTO income_categories (name, icon, is_default, is_merch)
VALUES ('Merch', 'Shirt', TRUE, TRUE)
ON CONFLICT (name) DO UPDATE SET is_merch = TRUE;

ALTER TABLE income
  ADD COLUMN merch_item_id UUID REFERENCES merch_items(id) ON DELETE SET NULL;

CREATE INDEX idx_income_merch_item ON income(merch_item_id) WHERE merch_item_id IS NOT NULL;
