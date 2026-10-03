-- ═══════════════════════════════════════════════════════════════
-- Coach invites (2026-10-03)
--   Admins invite a new coach with a link instead of creating the
--   account and a password for them. The coach opens /invite/<token>,
--   creates their own account (role 'coach', is_coach) and verifies
--   their email with the usual signup code.
--
--   A link works once (accepted_at is claimed atomically), expires
--   (expires_at, 7 days after it's made) and can be revoked
--   (revoked_at). Only admins read this table; the invite page and its
--   signup action use the service role.
--
--   Safe to apply ahead of the code: a new table nothing reads yet.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE coach_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT NOT NULL,
  email       TEXT,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at  TIMESTAMPTZ
);

-- The Coaches page lists the open ones, newest first
CREATE INDEX idx_coach_invites_open ON coach_invites(created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE coach_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coach invites"
  ON coach_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
