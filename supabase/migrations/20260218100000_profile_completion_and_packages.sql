-- ══════════════════════════════════════════════════════
-- MIGRATION: Add profile completion fields + update packages
-- ══════════════════════════════════════════════════════

-- ── Add new columns to profiles ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS health_conditions TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_package_id UUID REFERENCES packages(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Update the trigger function ──
-- Note: area and date_of_birth are set via profile update after signUp, not in the trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'player')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Update packages to match current pricing ──
DELETE FROM packages WHERE name IN ('Starter', 'Premium', 'Elite');

INSERT INTO packages (name, session_count, validity_days, price, description, sort_order) VALUES
  ('Single Session',  1,   1,  200.00, '1 training session', 1),
  ('Monthly',         8,  30, 1000.00, '8 training sessions over 1 month', 2),
  ('Popular',        12,  45, 1500.00, '12 training sessions over 45 days', 3),
  ('Quarterly',      24,  90, 2500.00, '24 training sessions over 3 months', 4)
ON CONFLICT DO NOTHING;
