-- ═══════════════════════════════════════
-- Income: custom categories + manual income tracking
-- (merch, sponsorships, tournament fees, ... — anything that isn't a subscription payment)
-- ═══════════════════════════════════════

-- ── Income Categories ──
CREATE TABLE income_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  icon        TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Income ──
CREATE TABLE income (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  UUID NOT NULL REFERENCES income_categories(id),
  description  TEXT,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  income_date  DATE NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID NOT NULL REFERENCES profiles(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──
CREATE INDEX idx_income_category ON income(category_id);
CREATE INDEX idx_income_date ON income(income_date);
CREATE INDEX idx_income_active ON income(is_active) WHERE is_active = TRUE;

-- ── Updated-at trigger (reuses existing function) ──
CREATE TRIGGER income_updated_at
  BEFORE UPDATE ON income
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security ──
ALTER TABLE income_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage income categories"
  ON income_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can manage income"
  ON income FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Seed default categories ──
INSERT INTO income_categories (name, icon, is_default) VALUES
  ('Merch', 'Shirt', TRUE),
  ('Sponsorship', 'Handshake', TRUE),
  ('Tournament Fees', 'Trophy', TRUE),
  ('Donations', 'HeartHandshake', TRUE)
ON CONFLICT (name) DO NOTHING;
