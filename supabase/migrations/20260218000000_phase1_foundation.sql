-- ══════════════════════════════════════════════════════
-- PHASE 1 MIGRATION: Foundation & Player Experience
-- Sports Academy Management Platform
-- ══════════════════════════════════════════════════════

-- ── ENUMS ──
CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
CREATE TYPE playing_level AS ENUM ('beginner', 'intermediate', 'advanced', 'professional');
CREATE TYPE group_level AS ENUM ('beginner', 'intermediate', 'advanced', 'mixed');
CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'expired', 'cancelled');
CREATE TYPE payment_method AS ENUM ('instapay', 'bank_transfer', 'vodafone_cash', 'cash');
CREATE TYPE payment_status AS ENUM ('pending', 'confirmed', 'rejected');


-- ══════════════════════════════════════
-- 1. PROFILES (extends auth.users)
-- ══════════════════════════════════════
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  role        user_role NOT NULL DEFAULT 'player',
  area        TEXT,
  playing_level playing_level,
  training_goals TEXT,
  avatar_url  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user signup
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ══════════════════════════════════════
-- 2. PACKAGES
-- ══════════════════════════════════════
CREATE TABLE packages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  session_count INTEGER NOT NULL CHECK (session_count > 0),
  validity_days INTEGER NOT NULL CHECK (validity_days > 0),
  price         DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default packages
INSERT INTO packages (name, session_count, validity_days, price, description, sort_order) VALUES
  ('Starter',  8,  30, 1200.00, '8 training sessions over 30 days', 1),
  ('Premium', 12,  45, 1600.00, '12 training sessions over 45 days', 2),
  ('Elite',   16,  60, 2000.00, '16 training sessions over 60 days', 3);


-- ══════════════════════════════════════
-- 3. SUBSCRIPTIONS
-- ══════════════════════════════════════
CREATE TABLE subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id         UUID NOT NULL REFERENCES packages(id),
  sessions_remaining INTEGER NOT NULL,
  sessions_total     INTEGER NOT NULL,
  start_date         DATE,
  end_date           DATE,
  status             subscription_status NOT NULL DEFAULT 'pending',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_player ON subscriptions(player_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ══════════════════════════════════════
-- 4. PAYMENTS
-- ══════════════════════════════════════
CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id  UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount           DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  method           payment_method NOT NULL,
  screenshot_url   TEXT,
  status           payment_status NOT NULL DEFAULT 'pending',
  confirmed_by     UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  confirmed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_player ON payments(player_id);
CREATE INDEX idx_payments_status ON payments(status);


-- ══════════════════════════════════════
-- 5. GROUPS
-- ══════════════════════════════════════
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  level       group_level NOT NULL DEFAULT 'mixed',
  max_players INTEGER NOT NULL DEFAULT 20,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default groups
INSERT INTO groups (name, level, max_players) VALUES
  ('Group A', 'advanced', 15),
  ('Group B', 'intermediate', 20),
  ('Group C', 'beginner', 20),
  ('Group D', 'mixed', 15);


-- ══════════════════════════════════════
-- 6. GROUP PLAYERS (junction)
-- ══════════════════════════════════════
CREATE TABLE group_players (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(group_id, player_id)
);

CREATE INDEX idx_group_players_group ON group_players(group_id);
CREATE INDEX idx_group_players_player ON group_players(player_id);


-- ══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_players ENABLE ROW LEVEL SECURITY;

-- Helper: check user role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── PROFILES ──
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT USING (auth_role() = 'admin');

CREATE POLICY "Coaches can view player profiles"
  ON profiles FOR SELECT USING (auth_role() = 'coach');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE USING (auth_role() = 'admin');

-- ── PACKAGES ──
CREATE POLICY "Anyone can view active packages"
  ON packages FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Admins can manage packages"
  ON packages FOR ALL USING (auth_role() = 'admin');

-- ── SUBSCRIPTIONS ──
CREATE POLICY "Players can view own subscriptions"
  ON subscriptions FOR SELECT USING (auth.uid() = player_id);

CREATE POLICY "Admins can manage all subscriptions"
  ON subscriptions FOR ALL USING (auth_role() = 'admin');

CREATE POLICY "Players can create own subscriptions"
  ON subscriptions FOR INSERT WITH CHECK (auth.uid() = player_id);

-- ── PAYMENTS ──
CREATE POLICY "Players can view own payments"
  ON payments FOR SELECT USING (auth.uid() = player_id);

CREATE POLICY "Players can create own payments"
  ON payments FOR INSERT WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Admins can manage all payments"
  ON payments FOR ALL USING (auth_role() = 'admin');

-- ── GROUPS ──
CREATE POLICY "Anyone authenticated can view groups"
  ON groups FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage groups"
  ON groups FOR ALL USING (auth_role() = 'admin');

-- ── GROUP PLAYERS ──
CREATE POLICY "Players can view own group membership"
  ON group_players FOR SELECT USING (auth.uid() = player_id);

CREATE POLICY "Admins can manage group players"
  ON group_players FOR ALL USING (auth_role() = 'admin');

CREATE POLICY "Coaches can view group players"
  ON group_players FOR SELECT USING (auth_role() = 'coach');


-- ══════════════════════════════════════════════════════
-- STORAGE BUCKET for payment screenshots
-- ══════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-screenshots', 'payment-screenshots', FALSE);

CREATE POLICY "Players can upload own screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Players can view own screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Admins can view all screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payment-screenshots'
    AND auth_role() = 'admin'
  );
