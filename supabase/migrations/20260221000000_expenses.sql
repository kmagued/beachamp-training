-- ═══════════════════════════════════════
-- Expenses: categories + expense tracking
-- ═══════════════════════════════════════

-- ── Expense Categories ──
CREATE TABLE expense_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  icon        TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Expenses ──
CREATE TABLE expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID NOT NULL REFERENCES expense_categories(id),
  description      TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date     DATE NOT NULL,
  is_recurring     BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_type  TEXT CHECK (recurrence_type IN ('monthly', 'weekly')),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID NOT NULL REFERENCES profiles(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recurring_needs_type CHECK (
    (is_recurring = FALSE) OR (recurrence_type IS NOT NULL)
  )
);

-- ── Indexes ──
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_recurring ON expenses(is_recurring) WHERE is_recurring = TRUE;
CREATE INDEX idx_expenses_active ON expenses(is_active) WHERE is_active = TRUE;

-- ── Updated-at trigger (reuses existing function) ──
CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security ──
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage expense categories"
  ON expense_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage expenses"
  ON expenses FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Seed default categories ──
INSERT INTO expense_categories (name, icon, is_default) VALUES
  ('Court Reservation', 'MapPin', TRUE),
  ('Coach Salary', 'GraduationCap', TRUE),
  ('Equipment', 'Package', TRUE),
  ('Utilities', 'Zap', TRUE),
  ('Marketing', 'Megaphone', TRUE),
  ('Other', 'MoreHorizontal', TRUE);
