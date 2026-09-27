-- ═══════════════════════════════════════════════════════════════
-- Groups on the leaderboard (2026-09-28)
--   Not every group plays King of Court: the "Private Session" group holds
--   one-to-one training booked as a group. A group with in_leaderboard off
--   gets no Scores card on the Daily Report and no Leaderboard tab.
--   Admins switch it in the group form ("Show on leaderboard").
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE groups ADD COLUMN in_leaderboard BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE groups SET in_leaderboard = FALSE WHERE lower(btrim(name)) = 'private session';
