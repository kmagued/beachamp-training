-- King of Court score tests: the present-only rule, the attendance clean-up trigger, and
-- closed months (the score lock and the awards).
-- Runs against STAGING in one transaction that always rolls back, so nothing persists.
--   ./scripts/db/test-king-of-court.sh staging

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

-- These cases score September and October 2026. If staging has either month closed, open
-- it for this transaction (rolled back with everything else) so every case starts open.
DELETE FROM leaderboard_month_closes WHERE month IN ('2026-09', '2026-10');

-- ── Fixtures ────────────────────────────────────────────────────────────
-- A throwaway group and session with one present and one absent player, plus an
-- admin, a coach and a player to act as under RLS.
SELECT set_config('kt.admin', coalesce((SELECT id::text FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('kt.coach', coalesce((SELECT id::text FROM profiles WHERE role = 'coach' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('kt.p1', coalesce((SELECT id::text FROM profiles WHERE role = 'player' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('kt.p2', coalesce((SELECT id::text FROM profiles WHERE role = 'player' ORDER BY created_at OFFSET 1 LIMIT 1), ''), true);

DO $$
DECLARE
  g UUID;
  s UUID;
BEGIN
  ASSERT current_setting('kt.admin') <> '', 'fixture: staging needs an admin profile';
  ASSERT current_setting('kt.coach') <> '', 'fixture: staging needs a coach profile';
  ASSERT current_setting('kt.p2') <> '', 'fixture: staging needs two player profiles';

  INSERT INTO groups (name) VALUES ('ZZ KOTC test') RETURNING id INTO g;
  INSERT INTO schedule_sessions (group_id, day_of_week, start_time, end_time)
    VALUES (g, 3, '18:00', '20:00') RETURNING id INTO s;
  INSERT INTO attendance (player_id, group_id, session_date, status, schedule_session_id) VALUES
    (current_setting('kt.p1')::uuid, g, DATE '2026-09-02', 'present', s),
    (current_setting('kt.p2')::uuid, g, DATE '2026-09-02', 'absent', s);

  PERFORM set_config('kt.group', g::text, true);
  PERFORM set_config('kt.session', s::text, true);
END $$;

CREATE FUNCTION pg_temp.score(p_player TEXT, p_points INTEGER) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
  VALUES (current_setting(p_player)::uuid, current_setting('kt.session')::uuid,
          current_setting('kt.group')::uuid, DATE '2026-09-02', p_points)
  ON CONFLICT (player_id, schedule_session_id, session_date) DO UPDATE SET points = EXCLUDED.points
$$;

CREATE FUNCTION pg_temp.points_of(p_player TEXT) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT points FROM king_of_court_scores
  WHERE player_id = current_setting(p_player)::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid
    AND session_date = DATE '2026-09-02'
$$;

CREATE FUNCTION pg_temp.set_status(p_player TEXT, p_status TEXT) RETURNS VOID LANGUAGE sql AS $$
  UPDATE attendance SET status = p_status
  WHERE player_id = current_setting(p_player)::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid
    AND session_date = DATE '2026-09-02'
$$;

-- ── 1. A present player can be scored; re-saving updates in place ──────
DO $$ BEGIN
  PERFORM pg_temp.score('kt.p1', 8);
  PERFORM pg_temp.score('kt.p1', 12);
  ASSERT pg_temp.points_of('kt.p1') = 12, '1: re-saving should update the score in place';
  ASSERT (SELECT count(*) FROM king_of_court_scores
          WHERE schedule_session_id = current_setting('kt.session')::uuid) = 1,
    '1: one row per player per occurrence';
END $$;

-- ── 2. An absent player, or a date with no attendance, cannot be scored ─
DO $$ BEGIN
  BEGIN
    PERFORM pg_temp.score('kt.p2', 5);
    RAISE EXCEPTION '2: scoring an absent player should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
    VALUES (current_setting('kt.p1')::uuid, current_setting('kt.session')::uuid,
            current_setting('kt.group')::uuid, DATE '2026-09-09', 5);
    RAISE EXCEPTION '2: scoring a date with no attendance should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ── 3. Points are 0-999, and 0 is a real score ──────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.score('kt.p1', 0);
  ASSERT pg_temp.points_of('kt.p1') = 0, '3: 0 should be stored';
  BEGIN
    PERFORM pg_temp.score('kt.p1', 1000);
    RAISE EXCEPTION '3: 1000 should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM pg_temp.score('kt.p1', -1);
    RAISE EXCEPTION '3: -1 should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM pg_temp.score('kt.p1', 12);
END $$;

-- ── 4. Re-saving attendance as present keeps the score ──────────────────
DO $$ BEGIN
  PERFORM pg_temp.set_status('kt.p1', 'present');
  ASSERT pg_temp.points_of('kt.p1') = 12, '4: re-saving present attendance must keep the score';
END $$;

-- ── 5. Present -> excused drops the score; back to present does not restore it
DO $$ BEGIN
  PERFORM pg_temp.set_status('kt.p1', 'excused');
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '5: changing away from present should delete the score';
  PERFORM pg_temp.set_status('kt.p1', 'present');
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '5: going back to present must not bring the score back';
END $$;

-- ── 6. Deleting the attendance row drops the score ──────────────────────
DO $$ BEGIN
  PERFORM pg_temp.score('kt.p1', 7);
  DELETE FROM attendance
  WHERE player_id = current_setting('kt.p1')::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid;
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '6: removing attendance should delete the score';

  -- Put p1 back as present and scored for the RLS cases below
  INSERT INTO attendance (player_id, group_id, session_date, status, schedule_session_id)
  VALUES (current_setting('kt.p1')::uuid, current_setting('kt.group')::uuid, DATE '2026-09-02',
          'present', current_setting('kt.session')::uuid);
  PERFORM pg_temp.score('kt.p1', 9);
END $$;

-- ── 7. Players and coaches cannot read scores ───────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.p1'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM king_of_court_scores) = 0, '7: players must not read scores';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.coach'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM king_of_court_scores) = 0, '7: coaches must not read scores';
  -- 8 (setup): a coach marks the player absent through their own client, as
  -- updateAttendanceRecord does. The coach's RLS must not stop the clean-up.
  UPDATE attendance SET status = 'absent'
  WHERE player_id = current_setting('kt.p1')::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid;
END $$;
RESET ROLE;

-- ── 8. ...and the score is gone even though the coach can't see the table ─
DO $$ BEGIN
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '8: a coach marking absent should delete the score despite RLS';
  PERFORM pg_temp.set_status('kt.p1', 'present');
END $$;

-- ── 9. As an admin under RLS: write and read through the admin policy ───
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.admin'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points, entered_by)
  VALUES (current_setting('kt.p1')::uuid, current_setting('kt.session')::uuid,
          current_setting('kt.group')::uuid, DATE '2026-09-02', 11, current_setting('kt.admin')::uuid);
  ASSERT (SELECT points FROM king_of_court_scores
          WHERE schedule_session_id = current_setting('kt.session')::uuid) = 11,
    '9: an admin should write and read scores';
END $$;
RESET ROLE;

-- ── 10. Groups are on the leaderboard by default; "Private Session" is not ─
DO $$ BEGIN
  ASSERT (SELECT in_leaderboard FROM groups WHERE id = current_setting('kt.group')::uuid),
    '10: a new group should be on the leaderboard by default';
  ASSERT NOT EXISTS (SELECT 1 FROM groups WHERE lower(btrim(name)) = 'private session' AND in_leaderboard),
    '10: the Private Session group must be off the leaderboard';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Closed months: leaderboard_month_closes, leaderboard_awards and the lock
-- ═══════════════════════════════════════════════════════════════════════

-- ── Fixtures ────────────────────────────────────────────────────────────
-- p1 is present and scored 11 (from case 9). p2 becomes present and stays unscored in
-- September, and is present and scored in October, which stays open. p3 is a throwaway
-- player who can be deleted, present and scored in September.
DO $$
DECLARE
  p3 UUID := gen_random_uuid();
BEGIN
  PERFORM pg_temp.set_status('kt.p2', 'present');

  INSERT INTO auth.users (id, instance_id, aud, role, email)
  VALUES (p3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'zz-kotc-test@example.invalid');
  INSERT INTO profiles (id, first_name, last_name, role) VALUES (p3, 'ZZ', 'KOTC test', 'player');
  PERFORM set_config('kt.p3', p3::text, true);

  INSERT INTO attendance (player_id, group_id, session_date, status, schedule_session_id) VALUES
    (p3, current_setting('kt.group')::uuid, DATE '2026-09-02', 'present', current_setting('kt.session')::uuid),
    (current_setting('kt.p2')::uuid, current_setting('kt.group')::uuid, DATE '2026-10-07', 'present',
     current_setting('kt.session')::uuid);
  PERFORM pg_temp.score('kt.p3', 6);
  INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
  VALUES (current_setting('kt.p2')::uuid, current_setting('kt.session')::uuid,
          current_setting('kt.group')::uuid, DATE '2026-10-07', 4);
END $$;

-- True when the statement is refused because September 2026 is closed. Any other
-- outcome (it ran, or it was refused for another reason) is false or an error.
CREATE FUNCTION pg_temp.refused_as_closed(p_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN FALSE;
EXCEPTION WHEN check_violation THEN
  RETURN SQLERRM LIKE 'The September 2026 leaderboard is closed%';
END $$;

CREATE FUNCTION pg_temp.status_of(p_player TEXT) RETURNS TEXT LANGUAGE sql AS $$
  SELECT status FROM attendance
  WHERE player_id = current_setting(p_player)::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid
    AND session_date = DATE '2026-09-02'
$$;

-- ── 11. One close row per month, written "YYYY-MM" ──────────────────────
DO $$ BEGIN
  BEGIN
    INSERT INTO leaderboard_month_closes (month) VALUES ('2026-13');
    RAISE EXCEPTION '11: month 2026-13 should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO leaderboard_month_closes (month) VALUES ('Sep 2026');
    RAISE EXCEPTION '11: month "Sep 2026" should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO leaderboard_month_closes (month, closed_by)
  VALUES ('2026-09', current_setting('kt.admin')::uuid);

  -- The action turns this unique_violation (23505) into "already closed"
  BEGIN
    INSERT INTO leaderboard_month_closes (month) VALUES ('2026-09');
    RAISE EXCEPTION '11: closing a closed month should have failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- ── 12. A closed month's scores cannot be added, changed or removed ─────
DO $$ BEGIN
  ASSERT pg_temp.refused_as_closed($q$
    INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
    VALUES (current_setting('kt.p2')::uuid, current_setting('kt.session')::uuid,
            current_setting('kt.group')::uuid, DATE '2026-09-02', 5) $q$),
    '12: scoring in a closed month should be refused as closed';
  ASSERT pg_temp.refused_as_closed($q$
    UPDATE king_of_court_scores SET points = 99
    WHERE player_id = current_setting('kt.p1')::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-09-02' $q$),
    '12: changing a closed month''s score should be refused as closed';
  ASSERT pg_temp.refused_as_closed($q$
    DELETE FROM king_of_court_scores
    WHERE player_id = current_setting('kt.p1')::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-09-02' $q$),
    '12: deleting a closed month''s score should be refused as closed';
  ASSERT pg_temp.points_of('kt.p1') = 11, '12: the closed month''s score must be untouched';
END $$;

-- ── 13. The refusal names the closed month even when another rule would also refuse;
--        a score can't be moved into a closed month; an open month stays editable ──
DO $$ BEGIN
  -- No attendance on the 9th: the present-only trigger would refuse this too
  ASSERT pg_temp.refused_as_closed($q$
    INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
    VALUES (current_setting('kt.p2')::uuid, current_setting('kt.session')::uuid,
            current_setting('kt.group')::uuid, DATE '2026-09-09', 5) $q$),
    '13: in a closed month the refusal must say the month is closed';
  ASSERT pg_temp.refused_as_closed($q$
    UPDATE king_of_court_scores SET session_date = DATE '2026-09-02'
    WHERE player_id = current_setting('kt.p2')::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-10-07' $q$),
    '13: moving a score into a closed month should be refused as closed';

  UPDATE king_of_court_scores SET points = 7
  WHERE player_id = current_setting('kt.p2')::uuid
    AND schedule_session_id = current_setting('kt.session')::uuid
    AND session_date = DATE '2026-10-07';
  ASSERT (SELECT points FROM king_of_court_scores
          WHERE player_id = current_setting('kt.p2')::uuid
            AND schedule_session_id = current_setting('kt.session')::uuid
            AND session_date = DATE '2026-10-07') = 7,
    '13: an open month must stay editable while another is closed';
END $$;

-- ── 14. Attendance changes that would drop a closed month's score are refused whole ─
DO $$ BEGIN
  ASSERT pg_temp.refused_as_closed($q$
    UPDATE attendance SET status = 'absent'
    WHERE player_id = current_setting('kt.p1')::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-09-02' $q$),
    '14: marking a scored player absent in a closed month should be refused as closed';
  ASSERT pg_temp.refused_as_closed($q$
    DELETE FROM attendance
    WHERE player_id = current_setting('kt.p1')::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-09-02' $q$),
    '14: removing a scored player''s attendance in a closed month should be refused as closed';
  ASSERT pg_temp.status_of('kt.p1') = 'present', '14: a refused change must leave attendance as it was';
  ASSERT pg_temp.points_of('kt.p1') = 11, '14: a refused change must leave the score as it was';

  -- An unscored player's attendance is free to change
  PERFORM pg_temp.set_status('kt.p2', 'excused');
  ASSERT pg_temp.status_of('kt.p2') = 'excused',
    '14: an unscored player''s attendance must stay editable in a closed month';
END $$;

-- ── 15. A coach, through their own client: refused the same way; can see that a
--        month is closed; cannot close or reopen one ──────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.coach'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE attendance SET status = 'absent'
    WHERE player_id = current_setting('kt.p1')::uuid
      AND schedule_session_id = current_setting('kt.session')::uuid
      AND session_date = DATE '2026-09-02';
    RAISE EXCEPTION '15: a coach marking a scored player absent in a closed month should have failed';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE 'The September 2026 leaderboard is closed%', '15: wrong refusal: ' || SQLERRM;
  END;

  ASSERT (SELECT count(*) FROM leaderboard_month_closes WHERE month = '2026-09') = 1,
    '15: any signed-in user should see that a month is closed';
  BEGIN
    INSERT INTO leaderboard_month_closes (month) VALUES ('2026-08');
    RAISE EXCEPTION '15: a coach closing a month should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- RLS hides the row from a coach's DELETE: no rows, no error
  DELETE FROM leaderboard_month_closes WHERE month = '2026-09';
END $$;
RESET ROLE;

DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM leaderboard_month_closes WHERE month = '2026-09'),
    '15: a coach must not be able to reopen a month';
  ASSERT pg_temp.status_of('kt.p1') = 'present', '15: the coach''s refused change must leave attendance as it was';
END $$;

-- ── 16. Awards: places 1 and 2 only, one per player per group per month, and only
--        for a closed month ───────────────────────────────────────────────────────
DO $$ BEGIN
  INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions) VALUES
    ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p1')::uuid, 1, 11, 1),
    ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p3')::uuid, 2, 6, 1);
  BEGIN
    INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
    VALUES ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p2')::uuid, 3, 1, 1);
    RAISE EXCEPTION '16: place 3 should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
    VALUES ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p1')::uuid, 2, 11, 1);
    RAISE EXCEPTION '16: a second award for the same player, group and month should have failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
    VALUES ('2026-10', current_setting('kt.group')::uuid, current_setting('kt.p2')::uuid, 1, 7, 1);
    RAISE EXCEPTION '16: an award for a month that isn''t closed should have failed';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

-- A player reads their own awards and nobody else's, and cannot award themselves
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.p1'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM leaderboard_awards WHERE group_id = current_setting('kt.group')::uuid) = 1,
    '16: a player should read their own award and not the other player''s';
  BEGIN
    INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
    VALUES ('2026-09', current_setting('kt.group')::uuid, current_setting('kt.p1')::uuid, 1, 999, 1);
    RAISE EXCEPTION '16: a player awarding themselves should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.p2'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM leaderboard_awards WHERE group_id = current_setting('kt.group')::uuid) = 0,
    '16: a player with no award must not read other players'' awards';
END $$;
RESET ROLE;

-- ── 17. Deleting a player takes their scores and awards, closed month or not ─────
DO $$ BEGIN
  DELETE FROM auth.users WHERE id = current_setting('kt.p3')::uuid;
  ASSERT NOT EXISTS (SELECT 1 FROM profiles WHERE id = current_setting('kt.p3')::uuid),
    '17: fixture: deleting the auth user should delete the profile';
  ASSERT NOT EXISTS (SELECT 1 FROM king_of_court_scores WHERE player_id = current_setting('kt.p3')::uuid),
    '17: a deleted player''s scores should go with them, even in a closed month';
  ASSERT NOT EXISTS (SELECT 1 FROM leaderboard_awards WHERE player_id = current_setting('kt.p3')::uuid),
    '17: a deleted player''s awards should go with them';
  ASSERT pg_temp.points_of('kt.p1') = 11, '17: other players'' scores must stay';
  ASSERT EXISTS (SELECT 1 FROM leaderboard_awards
                 WHERE player_id = current_setting('kt.p1')::uuid
                   AND group_id = current_setting('kt.group')::uuid),
    '17: other players'' awards must stay';
END $$;

-- ── 18. Reopening removes the month's awards and unlocks its scores ─────
DO $$ BEGIN
  DELETE FROM leaderboard_month_closes WHERE month = '2026-09';
  ASSERT NOT EXISTS (SELECT 1 FROM leaderboard_awards WHERE month = '2026-09'),
    '18: reopening should remove the month''s awards';
  PERFORM pg_temp.score('kt.p1', 13);
  ASSERT pg_temp.points_of('kt.p1') = 13, '18: a reopened month should be scorable again';
  PERFORM pg_temp.set_status('kt.p1', 'absent');
  ASSERT pg_temp.points_of('kt.p1') IS NULL, '18: and attendance changes should drop scores again';
END $$;

ROLLBACK;
