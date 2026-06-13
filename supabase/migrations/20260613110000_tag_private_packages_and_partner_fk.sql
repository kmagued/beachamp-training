-- ═══════════════════════════════════════════
-- Private team training: post-merge fixes
-- ═══════════════════════════════════════════

-- 1) Tag the private-session price packages.
-- These packages already existed in production (created manually with these
-- exact names), so the seed INSERTs in 20260613100000 were skipped by their
-- WHERE NOT EXISTS guard, leaving private_session_players NULL. The request
-- page filters on private_session_players, so the prices showed as "—".
-- Tag them by name; the page queries the tag (not the name), so this is
-- rename-safe going forward. Idempotent; a no-op on a fresh DB.
UPDATE packages SET private_session_players = 1 WHERE name = 'Private Session';
UPDATE packages SET private_session_players = 2 WHERE name = 'Private Team Training (2 Players only)';

-- 2) partner_player_id FK ON DELETE hardening (from code review).
-- partner_player_id is nullable (NULL = solo). Clearing it when a partner
-- profile is deleted is the correct behavior and avoids the default RESTRICT
-- blocking profile deletions. (CASCADE would wrongly delete the whole request.)
ALTER TABLE private_session_requests
  DROP CONSTRAINT IF EXISTS private_session_requests_partner_player_id_fkey,
  ADD CONSTRAINT private_session_requests_partner_player_id_fkey
    FOREIGN KEY (partner_player_id) REFERENCES profiles(id) ON DELETE SET NULL;
