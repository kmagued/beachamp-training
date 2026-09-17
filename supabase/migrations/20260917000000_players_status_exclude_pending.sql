-- A 'pending' subscription is awaiting payment confirmation and has no start/end
-- date yet, so `end_date IS NULL` let it mark the player active indefinitely.
-- Only confirmed subscriptions count now; a player already training on a pending
-- subscription is still active through the 30-day attendance check.
--
-- Dropped and recreated rather than replaced: profiles gained columns (is_coach)
-- after the view was created, so `p.*` no longer lines up with the old column list.
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
WHERE p.role = 'player';

GRANT SELECT ON players_with_status TO authenticated;
