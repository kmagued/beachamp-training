-- ═══════════════════════════════════════════
-- Private Team Training (2 players)
-- ═══════════════════════════════════════════

-- Packages: flag private-session price packages and encode player count.
-- NULL = normal subscription package; 1 = individual private; 2 = team private.
ALTER TABLE packages
  ADD COLUMN private_session_players INTEGER
  CHECK (private_session_players IS NULL OR private_session_players IN (1, 2));

INSERT INTO packages (name, session_count, validity_days, price, description, is_active, sort_order, private_session_players)
SELECT 'Private Session', 1, 30, 800.00, 'Single-player private session', TRUE, 100, 1
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Private Session');

INSERT INTO packages (name, session_count, validity_days, price, description, is_active, sort_order, private_session_players)
SELECT 'Private Team Training (2 Players only)', 1, 30, 1000.00, 'Two-player private team training', TRUE, 101, 2
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = 'Private Team Training (2 Players only)');

-- Requests: optional second player for team training (NULL = solo).
ALTER TABLE private_session_requests
  ADD COLUMN partner_player_id UUID REFERENCES profiles(id);
