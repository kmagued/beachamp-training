-- Badge and Beachamp Credits tests: the four measures, losing and regaining a badge,
-- credits, badge edits, the rules on the badges table, RLS, and a failing sync.
-- Runs against STAGING in one transaction that always rolls back, so nothing persists.
--   ./scripts/db/test-badges.sh staging

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL plpgsql.check_asserts = on;

-- ── Fixtures ────────────────────────────────────────────────────────────
-- Activity is dated in 2030 and the badges count from 5 Jan 2030, so real staging
-- activity can't reach them. Any real badges are removed for this transaction (rolled
-- back with everything else), along with credits held by the two test players.
SELECT set_config('bt.admin', coalesce((SELECT id::text FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('bt.p1', coalesce((SELECT id::text FROM profiles WHERE role = 'player' ORDER BY created_at LIMIT 1), ''), true);
SELECT set_config('bt.p2', coalesce((SELECT id::text FROM profiles WHERE role = 'player' ORDER BY created_at OFFSET 1 LIMIT 1), ''), true);

DO $$
DECLARE
  g  UUID;
  g2 UUID;
  s  UUID;
  s2 UUID;
BEGIN
  ASSERT current_setting('bt.admin') <> '', 'fixture: staging needs an admin profile';
  ASSERT current_setting('bt.p2') <> '', 'fixture: staging needs two player profiles';

  DELETE FROM badges;
  DELETE FROM credit_transactions
   WHERE player_id IN (current_setting('bt.p1')::uuid, current_setting('bt.p2')::uuid);

  INSERT INTO groups (name) VALUES ('ZZ Badges test') RETURNING id INTO g;
  INSERT INTO groups (name) VALUES ('ZZ Badges test 2') RETURNING id INTO g2;
  INSERT INTO schedule_sessions (group_id, day_of_week, start_time, end_time)
    VALUES (g, 3, '18:00', '20:00') RETURNING id INTO s;
  INSERT INTO schedule_sessions (group_id, day_of_week, start_time, end_time)
    VALUES (g2, 4, '18:00', '20:00') RETURNING id INTO s2;
  PERFORM set_config('bt.group', g::text, true);
  PERFORM set_config('bt.group2', g2::text, true);
  PERFORM set_config('bt.session', s::text, true);
  PERFORM set_config('bt.session2', s2::text, true);

  INSERT INTO badges (name, icon, measure, threshold, credits, counts_from, created_by) VALUES
    ('ZZ Regular',  'shield-check', 'sessions_attended', 3, 50,  DATE '2030-01-05', current_setting('bt.admin')::uuid),
    ('ZZ Streak',   'zap',          'attendance_streak', 3, 0,   DATE '2030-01-05', current_setting('bt.admin')::uuid),
    ('ZZ Century',  'sparkles',     'month_points',      20, 30, DATE '2030-01-05', current_setting('bt.admin')::uuid),
    ('ZZ Champion', 'trophy',       'monthly_wins',      1, 100, DATE '2030-01-05', current_setting('bt.admin')::uuid);
END $$;

-- Marks a player for a session (the first group's, or the second's), or changes the mark
CREATE FUNCTION pg_temp.attend(p_player TEXT, p_date DATE, p_status TEXT, p_second BOOLEAN DEFAULT FALSE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  g UUID := current_setting(CASE WHEN p_second THEN 'bt.group2' ELSE 'bt.group' END)::uuid;
  s UUID := current_setting(CASE WHEN p_second THEN 'bt.session2' ELSE 'bt.session' END)::uuid;
BEGIN
  UPDATE attendance SET status = p_status
   WHERE player_id = current_setting(p_player)::uuid AND schedule_session_id = s AND session_date = p_date;
  IF NOT FOUND THEN
    INSERT INTO attendance (player_id, group_id, session_date, status, schedule_session_id)
    VALUES (current_setting(p_player)::uuid, g, p_date, p_status, s);
  END IF;
END $$;

CREATE FUNCTION pg_temp.score(p_player TEXT, p_date DATE, p_points INTEGER, p_second BOOLEAN DEFAULT FALSE)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO king_of_court_scores (player_id, schedule_session_id, group_id, session_date, points)
  VALUES (current_setting(p_player)::uuid,
          current_setting(CASE WHEN p_second THEN 'bt.session2' ELSE 'bt.session' END)::uuid,
          current_setting(CASE WHEN p_second THEN 'bt.group2' ELSE 'bt.group' END)::uuid,
          p_date, p_points)
  ON CONFLICT (player_id, schedule_session_id, session_date) DO UPDATE SET points = EXCLUDED.points
$$;

-- The day a player earned a badge, or NULL if they don't hold it
CREATE FUNCTION pg_temp.earned(p_player TEXT, p_badge TEXT) RETURNS DATE LANGUAGE sql AS $$
  SELECT pb.earned_on FROM player_badges pb JOIN badges b ON b.id = pb.badge_id
   WHERE pb.player_id = current_setting(p_player)::uuid AND b.name = p_badge
$$;

CREATE FUNCTION pg_temp.note_of(p_player TEXT, p_badge TEXT) RETURNS UUID LANGUAGE sql AS $$
  SELECT pb.notification_id FROM player_badges pb JOIN badges b ON b.id = pb.badge_id
   WHERE pb.player_id = current_setting(p_player)::uuid AND b.name = p_badge
$$;

CREATE FUNCTION pg_temp.balance(p_player TEXT) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT COALESCE(sum(amount), 0)::int FROM credit_transactions WHERE player_id = current_setting(p_player)::uuid
$$;

CREATE FUNCTION pg_temp.credit_of(p_player TEXT, p_badge TEXT) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT c.amount FROM credit_transactions c
    JOIN player_badges pb ON pb.id = c.player_badge_id
    JOIN badges b ON b.id = pb.badge_id
   WHERE c.player_id = current_setting(p_player)::uuid AND b.name = p_badge
$$;

-- ── 1. Sessions attended: earned on the Nth present session since the start day ─
DO $$
DECLARE
  n RECORD;
BEGIN
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-03', 'present');   -- before the start day
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-06', 'present');
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'present', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') IS NULL,
    '1: two sessions since the start day must not earn a 3-session badge (the 3rd of Jan is before it)';

  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-08', 'present');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '1: earned on the 3rd session';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular') = 50, '1: the badge pays its 50 credits';

  SELECT title, body, type, link, is_read INTO n FROM notifications WHERE id = pg_temp.note_of('bt.p1', 'ZZ Regular');
  ASSERT n.title = 'You earned the ZZ Regular badge', '1: wrong title: ' || coalesce(n.title, '<none>');
  ASSERT n.body = 'Attended 3 sessions. +50 Beachamp Credits.', '1: wrong body: ' || coalesce(n.body, '<none>');
  ASSERT n.type = 'system' AND n.link = '/player/achievements' AND NOT n.is_read, '1: wrong type, link or read state';
END $$;

-- ── 2. A correction takes the badge, its credits and its unread notification; a read
--       notification stays; earning it again sends a new one ─────────────────────
DO $$
DECLARE
  first_note  UUID := pg_temp.note_of('bt.p1', 'ZZ Regular');
  second_note UUID;
BEGIN
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'absent', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') IS NULL, '2: marked absent, the badge should go';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular') IS NULL, '2: its credits should go with it';
  ASSERT NOT EXISTS (SELECT 1 FROM notifications WHERE id = first_note), '2: its unread notification should go';

  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'present', TRUE);
  second_note := pg_temp.note_of('bt.p1', 'ZZ Regular');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '2: present again, the badge comes back';
  ASSERT second_note IS NOT NULL AND second_note <> first_note, '2: earning it again sends a new notification';

  UPDATE notifications SET is_read = TRUE WHERE id = second_note;
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'absent', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') IS NULL, '2: absent again, the badge goes again';
  ASSERT EXISTS (SELECT 1 FROM notifications WHERE id = second_note), '2: a read notification stays in the inbox';

  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'present', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '2: and back again';
END $$;

-- ── 3. Attendance streak: absent resets, excused is skipped, no credits ──────────
DO $$
DECLARE
  n RECORD;
BEGIN
  PERFORM pg_temp.attend('bt.p2', DATE '2030-01-06', 'present');
  PERFORM pg_temp.attend('bt.p2', DATE '2030-01-08', 'absent');
  PERFORM pg_temp.attend('bt.p2', DATE '2030-01-10', 'present');
  PERFORM pg_temp.attend('bt.p2', DATE '2030-01-12', 'excused');
  PERFORM pg_temp.attend('bt.p2', DATE '2030-01-13', 'present');
  ASSERT pg_temp.earned('bt.p2', 'ZZ Streak') IS NULL,
    '3: present, absent, present, excused, present is a run of 2, not 3';
END $$;

-- The streak's progress, as p2 sees it
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bt.p2'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  pr RECORD;
BEGIN
  SELECT p.value, p.current_run INTO pr
    FROM my_badge_progress() p JOIN badges b ON b.id = p.badge_id WHERE b.name = 'ZZ Streak';
  ASSERT pr.value = 2 AND pr.current_run = 2,
    format('3: progress should be a best run of 2 and a current run of 2, got %s and %s', pr.value, pr.current_run);
END $$;
RESET ROLE;

DO $$
DECLARE
  n RECORD;
BEGIN
  PERFORM pg_temp.attend('bt.p2', DATE '2030-01-15', 'present');
  ASSERT pg_temp.earned('bt.p2', 'ZZ Streak') = DATE '2030-01-15', '3: the third in a row earns it';
  ASSERT pg_temp.credit_of('bt.p2', 'ZZ Streak') IS NULL, '3: a 0-credit badge writes no credit row';
  SELECT body INTO n FROM notifications WHERE id = pg_temp.note_of('bt.p2', 'ZZ Streak');
  ASSERT n.body = '3 sessions in a row.', '3: wrong body: ' || coalesce(n.body, '<none>');
END $$;

-- ── 4. The day a badge was reached moves with corrections ───────────────────────
DO $$ BEGIN
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-10', 'present');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '4: a 4th session leaves the day alone';
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-06', 'excused');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-10', '4: losing an earlier session moves the day';
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-06', 'present');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '4: and putting it back moves it back';
END $$;

-- ── 5. Points in one month: per group, per month, since the start day ───────────
DO $$ BEGIN
  PERFORM pg_temp.attend('bt.p1', DATE '2030-02-02', 'present');
  PERFORM pg_temp.score('bt.p1', DATE '2030-01-03', 10);         -- before the start day
  PERFORM pg_temp.score('bt.p1', DATE '2030-01-06', 8);
  PERFORM pg_temp.score('bt.p1', DATE '2030-01-07', 15, TRUE);   -- the other group
  PERFORM pg_temp.score('bt.p1', DATE '2030-01-08', 7);
  PERFORM pg_temp.score('bt.p1', DATE '2030-02-02', 10);         -- the next month
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') IS NULL,
    '5: 15 in January, 15 in the other group and 10 in February must not add up to 20';

  PERFORM pg_temp.score('bt.p1', DATE '2030-01-10', 6);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') = DATE '2030-01-10', '5: 21 in January earns it on the 10th';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Century') = 30, '5: it pays 30 credits';

  PERFORM pg_temp.score('bt.p1', DATE '2030-01-10', 4);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') IS NULL, '5: corrected to 19, the badge goes';
  PERFORM pg_temp.score('bt.p1', DATE '2030-01-10', 6);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') = DATE '2030-01-10', '5: back to 21, it returns';
END $$;

-- ── 6. Credits: the balance is the badges held; credits are fixed when earned; a new
--       number re-checks holders ──────────────────────────────────────────────────
DO $$ BEGIN
  -- p1 holds Regular (50), Century (30) and Streak (0)
  ASSERT pg_temp.earned('bt.p1', 'ZZ Streak') IS NOT NULL, '6: fixture: p1 should hold the streak badge';
  ASSERT pg_temp.balance('bt.p1') = 80, format('6: balance should be 80, got %s', pg_temp.balance('bt.p1'));

  UPDATE badges SET credits = 70 WHERE name = 'ZZ Regular';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular') = 50, '6: changing the credits leaves holders with what they got';

  UPDATE badges SET threshold = 10 WHERE name = 'ZZ Regular';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') IS NULL, '6: raising the number takes the badge from p1';
  ASSERT pg_temp.earned('bt.p2', 'ZZ Regular') IS NULL, '6: and from p2';
  ASSERT pg_temp.balance('bt.p1') = 30, '6: and its credits';

  UPDATE badges SET threshold = 3 WHERE name = 'ZZ Regular';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '6: lowering it gives it back';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular') = 70, '6: at the amount the badge pays now';
  ASSERT pg_temp.balance('bt.p1') = 100, '6: balance should be 100';
END $$;

-- ── 7. Monthly wins: 1st places from the start month on; reopening takes it back ─
DO $$ BEGIN
  INSERT INTO leaderboard_month_closes (month, closed_by) VALUES ('2029-12', current_setting('bt.admin')::uuid);
  INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
  VALUES ('2029-12', current_setting('bt.group')::uuid, current_setting('bt.p1')::uuid, 1, 40, 4);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Champion') IS NULL, '7: a win before the start month doesn''t count';

  INSERT INTO leaderboard_month_closes (month, closed_by) VALUES ('2030-01', current_setting('bt.admin')::uuid);
  INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
  VALUES ('2030-01', current_setting('bt.group')::uuid, current_setting('bt.p1')::uuid, 2, 21, 4);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Champion') IS NULL, '7: 2nd place isn''t a win';

  INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
  VALUES ('2030-01', current_setting('bt.group2')::uuid, current_setting('bt.p2')::uuid, 1, 30, 3);
  ASSERT pg_temp.earned('bt.p2', 'ZZ Champion') = (now() AT TIME ZONE 'Africa/Cairo')::date,
    '7: a 1st place earns it, dated the Cairo day the month was closed';
  ASSERT pg_temp.credit_of('bt.p2', 'ZZ Champion') = 100, '7: it pays 100 credits';

  DELETE FROM leaderboard_month_closes WHERE month = '2030-01';
  ASSERT pg_temp.earned('bt.p2', 'ZZ Champion') IS NULL, '7: reopening the month takes the badge back';
  ASSERT pg_temp.credit_of('bt.p2', 'ZZ Champion') IS NULL, '7: and its credits';
END $$;

-- ── 8. A new badge checks existing activity since its start day; deleting it takes it
--       from everyone, with credits and unread notifications ──────────────────────
DO $$
DECLARE
  note UUID;
BEGIN
  INSERT INTO badges (name, icon, measure, threshold, credits, counts_from)
  VALUES ('ZZ Two', 'star', 'sessions_attended', 2, 5, DATE '2030-01-05');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Two') IS NOT NULL AND pg_temp.earned('bt.p2', 'ZZ Two') IS NOT NULL,
    '8: creating a badge should award it to players who already meet it since its start day';
  note := pg_temp.note_of('bt.p1', 'ZZ Two');

  DELETE FROM badges WHERE name = 'ZZ Two';
  ASSERT NOT EXISTS (SELECT 1 FROM player_badges pb WHERE pb.notification_id = note), '8: deleting it removes it';
  ASSERT NOT EXISTS (SELECT 1 FROM notifications WHERE id = note), '8: and its unread notifications';
  ASSERT pg_temp.balance('bt.p1') = 100, '8: and its credits';
END $$;

-- ── 9. The badges table's rules ─────────────────────────────────────────
DO $$ BEGIN
  BEGIN
    INSERT INTO badges (name, icon, measure, threshold) VALUES ('ZZ One in a row', 'star', 'attendance_streak', 1);
    RAISE EXCEPTION '9: a streak of 1 should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO badges (name, icon, measure, threshold) VALUES ('  zz regular ', 'star', 'sessions_attended', 5);
    RAISE EXCEPTION '9: a name differing only in case and spaces should have failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO badges (name, icon, measure, threshold, credits) VALUES ('ZZ Negative', 'star', 'sessions_attended', 5, -1);
    RAISE EXCEPTION '9: negative credits should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO badges (name, icon, measure, threshold) VALUES ('ZZ Cat', 'cat', 'sessions_attended', 5);
    RAISE EXCEPTION '9: an icon outside the set should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO badges (name, icon, measure, threshold) VALUES (repeat('x', 41), 'star', 'sessions_attended', 5);
    RAISE EXCEPTION '9: a 41-character name should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE badges SET measure = 'monthly_wins' WHERE name = 'ZZ Regular';
    RAISE EXCEPTION '9: changing a badge''s measure should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE badges SET counts_from = DATE '2029-01-01' WHERE name = 'ZZ Regular';
    RAISE EXCEPTION '9: changing a badge''s start day should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ── 10. Row-level security, as p1 ───────────────────────────────────────
SELECT set_config('bt.p1_badges', (SELECT count(*)::text FROM player_badges WHERE player_id = current_setting('bt.p1')::uuid), true);
SELECT set_config('bt.p1_regular', (SELECT id::text FROM badges WHERE name = 'ZZ Regular'), true);

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bt.p1'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM player_badges)::text = current_setting('bt.p1_badges'),
    '10: a player should read their own badges and nobody else''s';
  ASSERT NOT EXISTS (SELECT 1 FROM credit_transactions WHERE player_id <> current_setting('bt.p1')::uuid),
    '10: a player must not read other players'' credits';
  ASSERT (SELECT count(*) FROM badges WHERE name LIKE 'ZZ %') = 4, '10: a player should see every badge';

  ASSERT (SELECT value FROM my_badge_progress() WHERE badge_id = current_setting('bt.p1_regular')::uuid) = 5,
    '10: progress should count p1''s 5 present sessions since the start day';
  ASSERT (SELECT count(*) FROM my_badge_progress()) = 4, '10: progress has one row per badge';

  BEGIN
    INSERT INTO badges (name, icon, measure, threshold) VALUES ('ZZ Mine', 'star', 'sessions_attended', 1);
    RAISE EXCEPTION '10: a player creating a badge should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO player_badges (badge_id, player_id, earned_on)
    VALUES (current_setting('bt.p1_regular')::uuid, current_setting('bt.p1')::uuid, DATE '2030-01-01');
    RAISE EXCEPTION '10: a player awarding themselves a badge should have failed';
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO credit_transactions (player_id, amount, description)
    VALUES (current_setting('bt.p1')::uuid, 1000, 'Free money');
    RAISE EXCEPTION '10: a player giving themselves credits should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM sync_player_badges(current_setting('bt.p1')::uuid);
    RAISE EXCEPTION '10: a player calling the sync should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- No update or delete policy: these touch nothing
  UPDATE credit_transactions SET amount = 999;
  DELETE FROM player_badges;
END $$;
RESET ROLE;

DO $$ BEGIN
  ASSERT pg_temp.balance('bt.p1') = 100, '10: a player''s update must not change their credits';
  ASSERT (SELECT count(*) FROM player_badges WHERE player_id = current_setting('bt.p1')::uuid)::text
         = current_setting('bt.p1_badges'), '10: a player''s delete must not remove their badges';
END $$;

-- ── 11. Deleting a player takes their badges and credits, without error ─────────
DO $$
DECLARE
  p3 UUID := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email)
  VALUES (p3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'zz-badges-test@example.invalid');
  INSERT INTO profiles (id, first_name, last_name, role) VALUES (p3, 'ZZ', 'Badges test', 'player');
  PERFORM set_config('bt.p3', p3::text, true);

  PERFORM pg_temp.attend('bt.p3', DATE '2030-01-06', 'present');
  PERFORM pg_temp.attend('bt.p3', DATE '2030-01-08', 'present');
  PERFORM pg_temp.attend('bt.p3', DATE '2030-01-10', 'present');
  ASSERT pg_temp.earned('bt.p3', 'ZZ Regular') IS NOT NULL, '11: fixture: p3 should hold the badge';

  DELETE FROM auth.users WHERE id = p3;
  ASSERT NOT EXISTS (SELECT 1 FROM player_badges WHERE player_id = p3), '11: a deleted player''s badges should go';
  ASSERT NOT EXISTS (SELECT 1 FROM credit_transactions WHERE player_id = p3), '11: and their credits';
END $$;

-- ── 12. A failing badge check never stops attendance being saved ───────────────
-- Last, because it breaks badge_measure for the rest of the transaction.
CREATE OR REPLACE FUNCTION badge_measure(p_player UUID, p_badge badges)
RETURNS TABLE (value INTEGER, current_run INTEGER, earned_on DATE) AS $$
BEGIN
  RAISE EXCEPTION 'simulated badge failure';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  before_count BIGINT := (SELECT count(*) FROM player_badges WHERE player_id = current_setting('bt.p2')::uuid);
BEGIN
  PERFORM pg_temp.attend('bt.p2', DATE '2030-01-20', 'present');
  ASSERT EXISTS (SELECT 1 FROM attendance
                  WHERE player_id = current_setting('bt.p2')::uuid AND session_date = DATE '2030-01-20'),
    '12: the attendance must be saved even though the badge check failed';
  ASSERT (SELECT count(*) FROM player_badges WHERE player_id = current_setting('bt.p2')::uuid) = before_count,
    '12: and the player''s badges are left as they were';
END $$;

ROLLBACK;
