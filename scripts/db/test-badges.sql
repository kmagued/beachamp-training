-- Badge, tier and Beachamp Credits tests: the four measures, tiers, losing and regaining,
-- corrections, credits, save_badge, RLS, deletions and a failing sync.
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

-- Creates a badge counting from 5 Jan 2030, then sets its tiers through save_badge
CREATE FUNCTION pg_temp.make_badge(p_name TEXT, p_icon TEXT, p_measure TEXT, p_tiers JSONB)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO badges (name, icon, measure, counts_from, created_by)
  VALUES (p_name, p_icon, p_measure, DATE '2030-01-05', current_setting('bt.admin')::uuid)
  RETURNING badges.id INTO v_id;
  PERFORM save_badge(v_id, p_name, p_icon, p_measure, p_tiers, NULL);
  RETURN v_id;
END $$;

-- Re-saves a fixture badge's tiers, as the admin's Edit drawer does
CREATE FUNCTION pg_temp.retier(p_name TEXT, p_tiers JSONB) RETURNS VOID LANGUAGE sql AS $$
  SELECT save_badge(b.id, b.name, b.icon, b.measure, p_tiers, NULL) FROM badges b WHERE b.name = p_name
$$;

DO $$
DECLARE
  g  UUID;
  g2 UUID;
  s  UUID;
  s2 UUID;
  s3 UUID;
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
  -- A second session for the first group, for two sessions on one day
  INSERT INTO schedule_sessions (group_id, day_of_week, start_time, end_time)
    VALUES (g, 3, '08:00', '10:00') RETURNING id INTO s3;
  PERFORM set_config('bt.group', g::text, true);
  PERFORM set_config('bt.group2', g2::text, true);
  PERFORM set_config('bt.session', s::text, true);
  PERFORM set_config('bt.session2', s2::text, true);
  PERFORM set_config('bt.session3', s3::text, true);

  PERFORM pg_temp.make_badge('ZZ Regular', 'shield-check', 'sessions_attended',
    '[{"threshold": 3, "credits": 50}, {"threshold": 5, "credits": 20}]');
  PERFORM pg_temp.make_badge('ZZ Streak', 'zap', 'attendance_streak', '[{"threshold": 3, "credits": 0}]');
  PERFORM pg_temp.make_badge('ZZ Century', 'sparkles', 'month_points', '[{"threshold": 20, "credits": 30}]');
  PERFORM pg_temp.make_badge('ZZ Champion', 'trophy', 'monthly_wins', '[{"threshold": 1, "credits": 100}]');
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

-- The day a player earned a badge's tier (1 = Bronze), or NULL if they don't hold it
CREATE FUNCTION pg_temp.earned(p_player TEXT, p_badge TEXT, p_tier INTEGER DEFAULT 1) RETURNS DATE LANGUAGE sql AS $$
  SELECT pb.earned_on FROM player_badges pb
    JOIN badge_tiers t ON t.id = pb.badge_tier_id
    JOIN badges b ON b.id = t.badge_id
   WHERE pb.player_id = current_setting(p_player)::uuid AND b.name = p_badge AND t.tier = p_tier
$$;

CREATE FUNCTION pg_temp.note_of(p_player TEXT, p_badge TEXT, p_tier INTEGER DEFAULT 1) RETURNS UUID LANGUAGE sql AS $$
  SELECT pb.notification_id FROM player_badges pb
    JOIN badge_tiers t ON t.id = pb.badge_tier_id
    JOIN badges b ON b.id = t.badge_id
   WHERE pb.player_id = current_setting(p_player)::uuid AND b.name = p_badge AND t.tier = p_tier
$$;

CREATE FUNCTION pg_temp.credit_of(p_player TEXT, p_badge TEXT, p_tier INTEGER DEFAULT 1) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT c.amount FROM credit_transactions c
    JOIN player_badges pb ON pb.id = c.player_badge_id
    JOIN badge_tiers t ON t.id = pb.badge_tier_id
    JOIN badges b ON b.id = t.badge_id
   WHERE c.player_id = current_setting(p_player)::uuid AND b.name = p_badge AND t.tier = p_tier
$$;

CREATE FUNCTION pg_temp.balance(p_player TEXT) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT COALESCE(sum(amount), 0)::int FROM credit_transactions WHERE player_id = current_setting(p_player)::uuid
$$;

CREATE FUNCTION pg_temp.present_count(p_player TEXT) RETURNS INTEGER LANGUAGE sql AS $$
  SELECT count(*)::int FROM attendance
   WHERE player_id = current_setting(p_player)::uuid AND status = 'present' AND session_date >= DATE '2030-01-05'
$$;

-- True when the statement is refused with exactly this message
CREATE FUNCTION pg_temp.refused_with(p_sql TEXT, p_message TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN FALSE;
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> p_message THEN
    RAISE EXCEPTION 'refused, but with "%" instead of "%"', SQLERRM, p_message;
  END IF;
  RETURN TRUE;
END $$;

-- ── 1. Sessions attended: Bronze on the Nth present session since the start day ─
DO $$
DECLARE
  n RECORD;
BEGIN
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-03', 'present');   -- before the start day
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-06', 'present');
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'present', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') IS NULL,
    '1: two sessions since the start day must not earn a 3-session tier (the 3rd of Jan is before it)';

  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-08', 'present');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '1: Bronze earned on the 3rd session';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular', 2) IS NULL, '1: Silver (5 sessions) not yet';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular') = 50, '1: Bronze pays its 50 credits';
  ASSERT (SELECT description FROM credit_transactions c JOIN player_badges pb ON pb.id = c.player_badge_id
           WHERE pb.notification_id = pg_temp.note_of('bt.p1', 'ZZ Regular')) = 'ZZ Regular badge (Bronze)',
    '1: the credit row names the badge and tier';

  SELECT title, body, type, link, is_read INTO n FROM notifications WHERE id = pg_temp.note_of('bt.p1', 'ZZ Regular');
  ASSERT n.title = 'You earned the Bronze ZZ Regular badge', '1: wrong title: ' || coalesce(n.title, '<none>');
  ASSERT n.body = 'Attended 3 sessions. +50 Beachamp Credits.', '1: wrong body: ' || coalesce(n.body, '<none>');
  ASSERT n.type = 'system' AND n.link = '/player/achievements' AND NOT n.is_read, '1: wrong type, link or read state';
END $$;

-- ── 2. A correction takes the tier, its credits and its unread notification; a read
--       notification stays; earning it again sends a new one ─────────────────────
DO $$
DECLARE
  first_note  UUID := pg_temp.note_of('bt.p1', 'ZZ Regular');
  second_note UUID;
BEGIN
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'absent', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') IS NULL, '2: marked absent, the tier should go';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular') IS NULL, '2: its credits should go with it';
  ASSERT NOT EXISTS (SELECT 1 FROM notifications WHERE id = first_note), '2: its unread notification should go';

  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'present', TRUE);
  second_note := pg_temp.note_of('bt.p1', 'ZZ Regular');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '2: present again, the tier comes back';
  ASSERT second_note IS NOT NULL AND second_note <> first_note, '2: earning it again sends a new notification';

  UPDATE notifications SET is_read = TRUE WHERE id = second_note;
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'absent', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') IS NULL, '2: absent again, the tier goes again';
  ASSERT EXISTS (SELECT 1 FROM notifications WHERE id = second_note), '2: a read notification stays in the inbox';

  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-07', 'present', TRUE);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '2: and back again';
END $$;

-- ── 3. Attendance streak: absent resets, excused is skipped, no credits ──────────
DO $$ BEGIN
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
  ASSERT pg_temp.earned('bt.p2', 'ZZ Streak') = DATE '2030-01-15', '3: the third in a row earns Bronze';
  ASSERT pg_temp.credit_of('bt.p2', 'ZZ Streak') IS NULL, '3: a 0-credit tier writes no credit row';
  SELECT body INTO n FROM notifications WHERE id = pg_temp.note_of('bt.p2', 'ZZ Streak');
  ASSERT n.body = '3 sessions in a row.', '3: wrong body: ' || coalesce(n.body, '<none>');

  -- Two sessions on one day are ordered by their time, not by when they were entered:
  -- the evening present is entered first, the morning absent second
  INSERT INTO attendance (player_id, group_id, session_date, session_time, status, schedule_session_id)
  VALUES (current_setting('bt.p2')::uuid, current_setting('bt.group')::uuid, DATE '2030-01-17', '18:00',
          'present', current_setting('bt.session')::uuid);
  INSERT INTO attendance (player_id, group_id, session_date, session_time, status, schedule_session_id)
  VALUES (current_setting('bt.p2')::uuid, current_setting('bt.group')::uuid, DATE '2030-01-17', '08:00',
          'absent', current_setting('bt.session3')::uuid);
END $$;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bt.p2'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT p.current_run FROM my_badge_progress() p JOIN badges b ON b.id = p.badge_id
           WHERE b.name = 'ZZ Streak') = 1,
    '3: the morning absence comes before the evening session, so the run is 1, not 0';
END $$;
RESET ROLE;

-- ── 4. The day a tier was reached moves with corrections ────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-10', 'present');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '4: a 4th session leaves the day alone';
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-06', 'excused');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-10', '4: losing an earlier session moves the day';
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-06', 'present');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-08', '4: and putting it back moves it back';
END $$;

-- ── 5. Points in one month: per group, per month, since the start day; marking a scored
--       player absent drops the score and the tier with it ──────────────────────────
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
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') IS NULL, '5: corrected to 19, the tier goes';
  PERFORM pg_temp.score('bt.p1', DATE '2030-01-10', 6);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') = DATE '2030-01-10', '5: back to 21, it returns';

  -- The existing trigger drops the score of a player marked absent; both tiers follow
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-10', 'absent');
  ASSERT NOT EXISTS (SELECT 1 FROM king_of_court_scores
                      WHERE player_id = current_setting('bt.p1')::uuid AND session_date = DATE '2030-01-10'),
    '5: fixture: marking absent should drop the score';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') IS NULL, '5: with the score gone, the points tier goes';
  PERFORM pg_temp.attend('bt.p1', DATE '2030-01-10', 'present');
  PERFORM pg_temp.score('bt.p1', DATE '2030-01-10', 6);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Century') = DATE '2030-01-10', '5: present and scored again, it returns';
END $$;

-- ── 6. Tiers are earned separately, each with its own credits and notification ───
DO $$
DECLARE
  n RECORD;
BEGIN
  -- p1 is present on the 6th, 7th, 8th, 10th of January and the 2nd of February: 5 sessions
  ASSERT pg_temp.present_count('bt.p1') = 5, '6: fixture: p1 should have 5 sessions';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular', 2) = DATE '2030-02-02', '6: Silver earned on the 5th session';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular', 2) = 20, '6: Silver pays its own 20 credits';
  SELECT title, body INTO n FROM notifications WHERE id = pg_temp.note_of('bt.p1', 'ZZ Regular', 2);
  ASSERT n.title = 'You earned the Silver ZZ Regular badge', '6: wrong title: ' || coalesce(n.title, '<none>');
  ASSERT n.body = 'Attended 5 sessions. +20 Beachamp Credits.', '6: wrong body: ' || coalesce(n.body, '<none>');
  -- Bronze 50 + Silver 20 + Century 30 (Streak pays nothing)
  ASSERT pg_temp.balance('bt.p1') = 100, format('6: balance should be 100, got %s', pg_temp.balance('bt.p1'));
END $$;

-- ── 7. Editing tiers: credits are fixed when earned; raising, removing and adding tiers
--       re-checks holders ────────────────────────────────────────────────────────
DO $$ BEGIN
  PERFORM pg_temp.retier('ZZ Regular', '[{"threshold": 3, "credits": 70}, {"threshold": 5, "credits": 20}]');
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular') = 50, '7: new credits leave holders with what they were paid';

  PERFORM pg_temp.retier('ZZ Regular', '[{"threshold": 4, "credits": 70}, {"threshold": 10, "credits": 20}]');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular') = DATE '2030-01-10', '7: Bronze raised to 4 is still held, reached on the 4th session';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular', 2) IS NULL, '7: Silver raised to 10 is taken back';
  ASSERT pg_temp.balance('bt.p1') = 80, '7: with its 20 credits';

  PERFORM pg_temp.retier('ZZ Regular', '[{"threshold": 4, "credits": 70}]');
  ASSERT NOT EXISTS (SELECT 1 FROM badge_tiers t JOIN badges b ON b.id = t.badge_id
                      WHERE b.name = 'ZZ Regular' AND t.tier = 2), '7: removing the top tier deletes it';

  PERFORM pg_temp.retier('ZZ Regular', '[{"threshold": 4, "credits": 70}, {"threshold": 5, "credits": 25}, {"threshold": 6, "credits": 40}]');
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular', 2) = DATE '2030-02-02', '7: a tier added on top is earned at once by players past it';
  ASSERT pg_temp.credit_of('bt.p1', 'ZZ Regular', 2) = 25, '7: at its current credits';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular', 3) IS NULL, '7: Gold at 6 is not reached with 5 sessions';
  ASSERT pg_temp.balance('bt.p1') = 105, format('7: balance should be 50 + 25 + 30 = 105, got %s', pg_temp.balance('bt.p1'));
END $$;

-- ── 8. save_badge refuses what the drawer would refuse ──────────────────────────
DO $$ BEGIN
  ASSERT pg_temp.refused_with($q$ SELECT pg_temp.retier('ZZ Regular', '[{"threshold": 4}, {"threshold": 4}]') $q$,
    'Silver needs a higher number than Bronze'), '8: a tier must be higher than the one below';
  ASSERT pg_temp.refused_with($q$ SELECT pg_temp.retier('ZZ Regular', '[]') $q$,
    'Add at least one tier'), '8: no tiers';
  ASSERT pg_temp.refused_with($q$ SELECT pg_temp.retier('ZZ Regular',
    '[{"threshold": 1}, {"threshold": 2}, {"threshold": 3}, {"threshold": 4}, {"threshold": 5}, {"threshold": 6}]') $q$,
    'A badge has at most 5 tiers'), '8: six tiers';
  ASSERT pg_temp.refused_with($q$ SELECT pg_temp.retier('ZZ Streak', '[{"threshold": 1}]') $q$,
    'Bronze: enter a whole number from 2 to 1000'), '8: a streak starts at 2';
  ASSERT pg_temp.refused_with($q$ SELECT pg_temp.retier('ZZ Regular', '[{"threshold": 1001}]') $q$,
    'Bronze: enter a whole number from 1 to 1000'), '8: numbers stop at 1000';
  ASSERT pg_temp.refused_with($q$ SELECT pg_temp.retier('ZZ Regular', '[{"threshold": 4, "credits": -1}]') $q$,
    'Bronze: enter a whole number of credits from 0 to 10000'), '8: no negative credits';
  ASSERT pg_temp.refused_with($q$ SELECT save_badge(b.id, b.name, b.icon, 'monthly_wins', '[{"threshold": 1}]', NULL)
                                  FROM badges b WHERE b.name = 'ZZ Regular' $q$,
    'A badge''s measure can''t be changed'), '8: the measure is fixed';
  ASSERT pg_temp.refused_with($q$ SELECT save_badge(gen_random_uuid(), 'Ghost', 'star', 'sessions_attended', '[{"threshold": 1}]', NULL) $q$,
    'That badge no longer exists'), '8: editing a deleted badge';
  ASSERT pg_temp.refused_with($q$ UPDATE badges SET counts_from = DATE '2029-01-01' WHERE name = 'ZZ Regular' $q$,
    'A badge''s measure and start day can''t be changed'), '8: the start day is fixed';
  BEGIN
    PERFORM save_badge(NULL, '  zz regular ', 'star', 'sessions_attended', '[{"threshold": 5}]', NULL);
    RAISE EXCEPTION '8: a name differing only in case and spaces should have failed';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM badge_tiers t JOIN badges b ON b.id = t.badge_id WHERE b.name = 'ZZ Regular') = 3,
    '8: a refused save leaves the tiers as they were';
END $$;

-- ── 9. Monthly wins: 1st places from the start month on; reopening takes it back ─
DO $$ BEGIN
  INSERT INTO leaderboard_month_closes (month, closed_by) VALUES ('2029-12', current_setting('bt.admin')::uuid);
  INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
  VALUES ('2029-12', current_setting('bt.group')::uuid, current_setting('bt.p1')::uuid, 1, 40, 4);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Champion') IS NULL, '9: a win before the start month doesn''t count';

  INSERT INTO leaderboard_month_closes (month, closed_by) VALUES ('2030-01', current_setting('bt.admin')::uuid);
  INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
  VALUES ('2030-01', current_setting('bt.group')::uuid, current_setting('bt.p1')::uuid, 2, 21, 4);
  ASSERT pg_temp.earned('bt.p1', 'ZZ Champion') IS NULL, '9: 2nd place isn''t a win';

  INSERT INTO leaderboard_awards (month, group_id, player_id, place, points, sessions)
  VALUES ('2030-01', current_setting('bt.group2')::uuid, current_setting('bt.p2')::uuid, 1, 30, 3);
  ASSERT pg_temp.earned('bt.p2', 'ZZ Champion') = (now() AT TIME ZONE 'Africa/Cairo')::date,
    '9: a 1st place earns it, dated the Cairo day the month was closed';
  ASSERT pg_temp.credit_of('bt.p2', 'ZZ Champion') = 100, '9: it pays 100 credits';

  DELETE FROM leaderboard_month_closes WHERE month = '2030-01';
  ASSERT pg_temp.earned('bt.p2', 'ZZ Champion') IS NULL, '9: reopening the month takes it back';
  ASSERT pg_temp.credit_of('bt.p2', 'ZZ Champion') IS NULL, '9: and its credits';
END $$;

-- ── 10. A new badge checks existing activity since its start day; deleting it takes it
--        from everyone, with credits and unread notifications ─────────────────────
DO $$
DECLARE
  v_id UUID;
  note UUID;
  before_balance INTEGER := pg_temp.balance('bt.p1');
BEGIN
  -- Created through save_badge, so it counts from today, which is before the 2030 fixtures
  v_id := save_badge(NULL, 'ZZ Two', 'star', 'sessions_attended', '[{"threshold": 2, "credits": 5}]', current_setting('bt.admin')::uuid);
  ASSERT (SELECT counts_from FROM badges WHERE badges.id = v_id) = (now() AT TIME ZONE 'Africa/Cairo')::date,
    '10: a new badge counts from today, in Cairo';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Two') IS NOT NULL AND pg_temp.earned('bt.p2', 'ZZ Two') IS NOT NULL,
    '10: creating a badge should award it to players who already meet it since its start day';
  note := pg_temp.note_of('bt.p1', 'ZZ Two');

  DELETE FROM badges WHERE badges.id = v_id;
  ASSERT NOT EXISTS (SELECT 1 FROM player_badges pb WHERE pb.notification_id = note), '10: deleting it removes it';
  ASSERT NOT EXISTS (SELECT 1 FROM notifications WHERE notifications.id = note), '10: and its unread notifications';
  ASSERT pg_temp.balance('bt.p1') = before_balance, '10: and its credits';
END $$;

-- ── 11. Attendance moved to another player re-checks both ───────────────────────
DO $$ BEGIN
  ASSERT pg_temp.earned('bt.p2', 'ZZ Streak') IS NOT NULL, '11: fixture: p2 should hold the streak';
  UPDATE attendance SET player_id = current_setting('bt.p1')::uuid
   WHERE player_id = current_setting('bt.p2')::uuid AND session_date = DATE '2030-01-15';
  ASSERT pg_temp.earned('bt.p2', 'ZZ Streak') IS NULL, '11: the player who lost the session loses the streak';
  ASSERT pg_temp.present_count('bt.p1') = 6, '11: fixture: p1 gains the session';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular', 3) = DATE '2030-02-02',
    '11: and the player who gained it reaches Gold (6 sessions), on the 6th in date order';

  UPDATE attendance SET player_id = current_setting('bt.p2')::uuid
   WHERE player_id = current_setting('bt.p1')::uuid AND session_date = DATE '2030-01-15';
  ASSERT pg_temp.earned('bt.p2', 'ZZ Streak') IS NOT NULL, '11: moved back, p2 has the streak again';
  ASSERT pg_temp.earned('bt.p1', 'ZZ Regular', 3) IS NULL, '11: and p1 loses Gold';
END $$;

-- ── 12. badge_summaries: holders and the credits actually paid ──────────────────
DO $$
DECLARE
  s RECORD;
BEGIN
  SELECT bs.holders, bs.credits_paid INTO s
    FROM badge_summaries() bs JOIN badges b ON b.id = bs.badge_id WHERE b.name = 'ZZ Regular';
  ASSERT s.holders = (SELECT count(DISTINCT pb.player_id) FROM player_badges pb
                        JOIN badge_tiers t ON t.id = pb.badge_tier_id JOIN badges b ON b.id = t.badge_id
                       WHERE b.name = 'ZZ Regular'), '12: holders should count each player once';
  ASSERT s.credits_paid = (SELECT sum(c.amount) FROM credit_transactions c JOIN player_badges pb ON pb.id = c.player_badge_id
                             JOIN badge_tiers t ON t.id = pb.badge_tier_id JOIN badges b ON b.id = t.badge_id
                            WHERE b.name = 'ZZ Regular'), '12: credits paid should be what was actually paid';
END $$;

-- ── 13. Row-level security, as p1 ───────────────────────────────────────
SELECT set_config('bt.p1_badges', (SELECT count(*)::text FROM player_badges WHERE player_id = current_setting('bt.p1')::uuid), true);
SELECT set_config('bt.p1_regular', (SELECT id::text FROM badges WHERE name = 'ZZ Regular'), true);

SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bt.p1'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM player_badges)::text = current_setting('bt.p1_badges'),
    '13: a player should read their own tiers and nobody else''s';
  ASSERT NOT EXISTS (SELECT 1 FROM credit_transactions WHERE player_id <> current_setting('bt.p1')::uuid),
    '13: a player must not read other players'' credits';
  ASSERT (SELECT count(*) FROM badges WHERE name LIKE 'ZZ %') = 4, '13: a player should see every badge';
  ASSERT (SELECT count(*) FROM badge_tiers t JOIN badges b ON b.id = t.badge_id WHERE b.name = 'ZZ Regular') = 3,
    '13: and every tier';

  ASSERT (SELECT value FROM my_badge_progress() WHERE badge_id = current_setting('bt.p1_regular')::uuid) = 5,
    '13: progress should count p1''s 5 present sessions since the start day';
  ASSERT (SELECT count(*) FROM my_badge_progress()) = 4, '13: progress has one row per badge';

  BEGIN
    INSERT INTO badges (name, icon, measure) VALUES ('ZZ Mine', 'star', 'sessions_attended');
    RAISE EXCEPTION '13: a player creating a badge should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO badge_tiers (badge_id, tier, threshold) VALUES (current_setting('bt.p1_regular')::uuid, 4, 999);
    RAISE EXCEPTION '13: a player adding a tier should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO player_badges (badge_tier_id, player_id, earned_on)
    SELECT t.id, current_setting('bt.p1')::uuid, DATE '2030-01-01'
      FROM badge_tiers t WHERE t.badge_id = current_setting('bt.p1_regular')::uuid AND t.tier = 3;
    RAISE EXCEPTION '13: a player awarding themselves a tier should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO credit_transactions (player_id, amount, description)
    VALUES (current_setting('bt.p1')::uuid, 1000, 'Free money');
    RAISE EXCEPTION '13: a player giving themselves credits should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM sync_player_badges(current_setting('bt.p1')::uuid);
    RAISE EXCEPTION '13: a player calling the sync should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM save_badge(NULL, 'ZZ Mine', 'star', 'sessions_attended', '[{"threshold": 1, "credits": 10000}]', NULL);
    RAISE EXCEPTION '13: a player calling save_badge should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- No update or delete policies: these touch nothing
  UPDATE badges SET name = 'Hacked';
  DELETE FROM badges;
  UPDATE badge_tiers SET credits = 10000;
  UPDATE player_badges SET earned_on = DATE '2000-01-01';
  DELETE FROM player_badges;
  UPDATE credit_transactions SET amount = 999;
  DELETE FROM credit_transactions;
END $$;
RESET ROLE;

DO $$ BEGIN
  ASSERT (SELECT count(*) FROM badges WHERE name LIKE 'ZZ %') = 4, '13: a player''s update or delete must not touch badges';
  ASSERT NOT EXISTS (SELECT 1 FROM badge_tiers WHERE credits = 10000), '13: or tiers';
  ASSERT (SELECT count(*) FROM player_badges WHERE player_id = current_setting('bt.p1')::uuid)::text
         = current_setting('bt.p1_badges'), '13: or their held tiers';
  ASSERT NOT EXISTS (SELECT 1 FROM player_badges WHERE earned_on = DATE '2000-01-01'), '13: or the days they were earned';
  ASSERT pg_temp.balance('bt.p1') = 105, '13: or their credits';
END $$;

-- ── 14. Deleting a player takes their tiers and credits, without error ──────────
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
  PERFORM pg_temp.attend('bt.p3', DATE '2030-01-13', 'present');
  ASSERT pg_temp.earned('bt.p3', 'ZZ Regular') IS NOT NULL, '14: fixture: p3 should hold Bronze';

  DELETE FROM auth.users WHERE id = p3;
  ASSERT NOT EXISTS (SELECT 1 FROM player_badges WHERE player_id = p3), '14: a deleted player''s tiers should go';
  ASSERT NOT EXISTS (SELECT 1 FROM credit_transactions WHERE player_id = p3), '14: and their credits';
END $$;

-- ── 15. A failing badge check never stops attendance being saved ───────────────
-- Last, because it breaks badge_measure for the rest of the transaction.
CREATE OR REPLACE FUNCTION badge_measure(p_player UUID, p_badge badges, p_thresholds INTEGER[])
RETURNS TABLE (value INTEGER, current_run INTEGER, reached_on DATE[]) AS $$
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
    '15: the attendance must be saved even though the badge check failed';
  ASSERT (SELECT count(*) FROM player_badges WHERE player_id = current_setting('bt.p2')::uuid) = before_count,
    '15: and the player''s tiers are left as they were';
END $$;

ROLLBACK;
