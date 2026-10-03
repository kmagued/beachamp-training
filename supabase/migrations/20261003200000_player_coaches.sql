-- ═══════════════════════════════════════════════════════════════
-- Players who coach (2026-10-03)
--   An admin can make an existing player a coach: role stays 'player'
--   and is_coach = TRUE, so they keep their player account and stay in
--   every player list. Coach access in RLS used to key on role, which a
--   player who coaches doesn't have; it now keys on "can coach":
--   role = 'coach' OR is_coach, via auth_can_coach().
--
--   Safe to apply ahead of the code: today every is_coach = TRUE account
--   is a coach or an admin, and both already pass these rules, so nobody
--   gains or loses access until a player is made a coach.
-- ═══════════════════════════════════════════════════════════════

-- Built like auth_role(): SECURITY DEFINER, so rules on profiles can call
-- it without recursing into profiles' own rules.
CREATE OR REPLACE FUNCTION auth_can_coach()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'coach' OR is_coach FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ── What a coach reads: players, group members, subscriptions ──
DROP POLICY IF EXISTS "Coaches can view player profiles" ON profiles;
CREATE POLICY "Coaches can view player profiles"
  ON profiles FOR SELECT USING (auth_can_coach());

DROP POLICY IF EXISTS "Coaches can view group players" ON group_players;
CREATE POLICY "Coaches can view group players"
  ON group_players FOR SELECT USING (auth_can_coach());

DROP POLICY IF EXISTS "Coaches can view subscriptions" ON subscriptions;
CREATE POLICY "Coaches can view subscriptions"
  ON subscriptions FOR SELECT USING (auth_can_coach());

-- ── What a coach writes: attendance, feedback to players, session plans ──
DROP POLICY IF EXISTS "Coaches and admins can manage attendance" ON attendance;
CREATE POLICY "Coaches and admins can manage attendance"
  ON attendance FOR ALL USING (auth_role() = 'admin' OR auth_can_coach());

DROP POLICY IF EXISTS "Coaches and admins can manage feedback" ON feedback;
CREATE POLICY "Coaches and admins can manage feedback"
  ON feedback FOR ALL USING (auth_role() = 'admin' OR auth_can_coach());

DROP POLICY IF EXISTS "Coaches and admins can manage session plans" ON session_plans;
CREATE POLICY "Coaches and admins can manage session plans"
  ON session_plans FOR ALL USING (auth_role() = 'admin' OR auth_can_coach());

-- ── Players see who coaches, so a player who coaches can be picked for
--    feedback and private sessions ──
DROP POLICY IF EXISTS "Players can view coach profiles" ON profiles;
CREATE POLICY "Players can view coach profiles"
  ON profiles FOR SELECT
  USING (auth_role() = 'player' AND (role IN ('coach', 'admin') OR is_coach));
