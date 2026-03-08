-- ══════════════════════════════════════════
-- Promo Codes
-- ══════════════════════════════════════════

-- Promo codes table
CREATE TABLE promo_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL,
  discount_type  TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  expiry_date    DATE,
  max_uses       INTEGER,
  per_player_limit INTEGER NOT NULL DEFAULT 1,
  package_ids    UUID[],
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive unique code
CREATE UNIQUE INDEX idx_promo_codes_code ON promo_codes (UPPER(code));

-- Updated-at trigger
CREATE TRIGGER promo_codes_updated_at
  BEFORE UPDATE ON promo_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Promo code usage tracking
CREATE TABLE promo_code_uses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id   UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES profiles(id),
  subscription_id UUID REFERENCES subscriptions(id),
  payment_id      UUID REFERENCES payments(id),
  discount_amount NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promo_code_uses_code ON promo_code_uses(promo_code_id);
CREATE INDEX idx_promo_code_uses_player ON promo_code_uses(player_id);

-- Add promo_code_id to payments and subscriptions
ALTER TABLE payments ADD COLUMN promo_code_id UUID REFERENCES promo_codes(id);
ALTER TABLE subscriptions ADD COLUMN promo_code_id UUID REFERENCES promo_codes(id);

-- ── RLS ──

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses ENABLE ROW LEVEL SECURITY;

-- Admins can do everything with promo codes
CREATE POLICY "Admins can manage promo codes"
  ON promo_codes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Players can view active promo codes (for validation)
CREATE POLICY "Authenticated users can view promo codes"
  ON promo_codes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admins can manage all promo code uses
CREATE POLICY "Admins can manage promo code uses"
  ON promo_code_uses FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Players can view their own promo code uses
CREATE POLICY "Players can view own promo code uses"
  ON promo_code_uses FOR SELECT
  USING (player_id = auth.uid());

-- Players can insert their own promo code uses
CREATE POLICY "Players can insert own promo code uses"
  ON promo_code_uses FOR INSERT
  WITH CHECK (player_id = auth.uid());
