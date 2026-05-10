-- ═══════════════════════════════════════════════════════════════
-- is_coach flag (2026-05-11)
--   Decouple "can be assigned as coach to sessions" from `role`.
--   An admin can opt into being a coach without giving up the admin portal.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN is_coach BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: existing role='coach' rows are coaches by definition.
UPDATE profiles SET is_coach = TRUE WHERE role = 'coach';

CREATE INDEX idx_profiles_is_coach ON profiles(is_coach) WHERE is_coach = TRUE;
