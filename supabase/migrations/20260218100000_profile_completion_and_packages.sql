-- ══════════════════════════════════════════════════════
-- MIGRATION: Add profile completion fields + update packages
-- ══════════════════════════════════════════════════════

-- ── Add new columns to profiles ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS health_conditions TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_package_id UUID REFERENCES packages(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Disable the auto-profile trigger ──
-- Profile creation is handled by the register server action using
-- the service role client (bypasses RLS). This avoids trigger issues
-- with type casting and metadata access.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ── Update packages to match current pricing ──
DELETE FROM packages WHERE name IN ('Starter', 'Premium', 'Elite');

INSERT INTO packages (name, session_count, validity_days, price, description, sort_order) VALUES
  ('Single Session',  1,   1,  200.00, '1 training session', 1),
  ('Monthly',         8,  30, 1000.00, '8 training sessions over 1 month', 2),
  ('Popular',        12,  45, 1500.00, '12 training sessions over 45 days', 3),
  ('Quarterly',      24,  90, 2500.00, '24 training sessions over 3 months', 4)
ON CONFLICT DO NOTHING;
