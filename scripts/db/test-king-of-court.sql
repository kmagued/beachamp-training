-- King of Court score tests: the present-only rule and the attendance clean-up trigger.
-- Runs against STAGING in one transaction that always rolls back, so nothing persists.
--   ./scripts/db/test-king-of-court.sh staging

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

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

ROLLBACK;
