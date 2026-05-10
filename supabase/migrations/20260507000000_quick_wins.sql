-- ═══════════════════════════════════════════════════════════════
-- Quick Wins Batch (2026-05-07)
--   1. profiles.occupation — optional free-text field
--   2. system_settings — generic key/value config table
--   3. players_with_status — unified active-status view
--   4. attendance index for the view's EXISTS subquery
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Occupation column on profiles ─────────────────────────
ALTER TABLE profiles ADD COLUMN occupation TEXT;

-- ─── 2. system_settings key/value store ───────────────────────
CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage system_settings"
  ON system_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE TRIGGER system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 3. Unified active-status view ────────────────────────────
-- A player is "currently active" if they attended in the last 30 days
-- OR have a valid subscription with sessions remaining.
CREATE OR REPLACE VIEW players_with_status AS
SELECT
  p.*,
  EXISTS (
    SELECT 1 FROM attendance a
    WHERE a.player_id = p.id
      AND a.session_date >= CURRENT_DATE - INTERVAL '30 days'
      AND a.status = 'present'
  )
  OR EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.player_id = p.id
      AND s.status IN ('active', 'pending')
      AND s.sessions_remaining > 0
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
  ) AS is_currently_active
FROM profiles p
WHERE p.role = 'player';

GRANT SELECT ON players_with_status TO authenticated;

-- ─── 4. Supporting index ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_player_date_status
  ON attendance(player_id, session_date, status);
