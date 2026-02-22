-- Replace default expense categories with 4 new ones
-- Deactivate old defaults that are being removed
UPDATE expense_categories SET is_active = false
WHERE is_default = true AND name IN ('Coach Salary', 'Utilities', 'Marketing', 'Other');

-- Ensure the 4 target categories exist and are active
INSERT INTO expense_categories (name, icon, is_default) VALUES
  ('Court Reservation', 'MapPin', true),
  ('Salary', 'Banknote', true),
  ('Variable', 'TrendingUp', true),
  ('Equipment', 'Package', true)
ON CONFLICT (name) DO UPDATE SET is_active = true, is_default = true;

-- Court reservation calculation fields on expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS court_count INTEGER,
  ADD COLUMN IF NOT EXISTS court_hours NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS court_hourly_rate NUMERIC(10,2);
