-- ═══════════════════════════════════════════════════════════════
-- Admins who also play (2026-10-04)
--   An admin who plays keeps role 'admin' and gets is_player, the way a
--   player who coaches keeps role 'player' and gets is_coach. A player is
--   now role 'player' OR is_player wherever players are listed.
--
--   Safe to apply ahead of the code: today's code ignores the column. The
--   only visible change is that flagged admins get a row in
--   players_with_status, which today's Players list never asks about.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_player BOOLEAN NOT NULL DEFAULT FALSE;

-- Admins with player history (subscriptions, groups or attendance) are players too
UPDATE profiles p SET is_player = TRUE
WHERE p.role = 'admin' AND (
  EXISTS (SELECT 1 FROM subscriptions s WHERE s.player_id = p.id)
  OR EXISTS (SELECT 1 FROM group_players g WHERE g.player_id = p.id)
  OR EXISTS (SELECT 1 FROM attendance a WHERE a.player_id = p.id)
);

-- Dropped and recreated rather than replaced: p.* gains is_player, so the
-- column list no longer lines up with the old view
DROP VIEW IF EXISTS players_with_status;

CREATE VIEW players_with_status AS
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
      AND s.status = 'active'
      AND s.sessions_remaining > 0
      AND (s.end_date IS NULL OR s.end_date >= CURRENT_DATE)
  ) AS is_currently_active
FROM profiles p
WHERE p.role = 'player' OR p.is_player;

GRANT SELECT ON players_with_status TO authenticated;

-- Player access is protected like role, coach access and active status:
-- only an admin or the server (service role, no signed-in user) changes it
CREATE OR REPLACE FUNCTION guard_profile_access_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.is_coach IS DISTINCT FROM OLD.is_coach
      OR NEW.is_player IS DISTINCT FROM OLD.is_player
      OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     -- A signed-in user who isn't an admin; the service role has no auth.uid()
     AND auth.uid() IS NOT NULL
     AND auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change role, coach or player access, or active status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
