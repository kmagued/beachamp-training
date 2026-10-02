-- ═══════════════════════════════════════════════════════════════
-- Badges and Beachamp Credits (2026-10-02)
--   An admin defines badges: a measure (sessions attended, attendance
--   streak, points in one month, monthly wins) and a number. Players earn
--   them automatically, and each pays out Beachamp Credits, a balance a
--   later build will let players spend on merch.
--
--   A badge is held only while the player meets it. Triggers on attendance,
--   King of Court scores and monthly awards re-check the player on every
--   change, so a correction can take a badge (and its credits) back.
--   A badge counts only activity on or after the day it was created.
--
--   Nothing is awarded until an admin creates a badge, so this is safe to
--   apply ahead of the code.
-- ═══════════════════════════════════════════════════════════════

-- ── Tables ──

CREATE TABLE badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  icon        TEXT NOT NULL CHECK (icon IN ('shield-check', 'star', 'flame', 'zap', 'trophy', 'crown',
                                            'medal', 'award', 'target', 'sparkles', 'rocket', 'volleyball')),
  measure     TEXT NOT NULL CHECK (measure IN ('sessions_attended', 'attendance_streak', 'month_points', 'monthly_wins')),
  -- A streak of 1 is the same as attending once, so streaks start at 2
  threshold   INTEGER NOT NULL CHECK (threshold BETWEEN 1 AND 1000
                                      AND (measure <> 'attendance_streak' OR threshold >= 2)),
  credits     INTEGER NOT NULL DEFAULT 0 CHECK (credits BETWEEN 0 AND 10000),
  -- Only activity on or after this Cairo date counts toward the badge
  counts_from DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Cairo')::date,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX badges_name_unique ON badges (lower(btrim(name)));

CREATE TRIGGER badges_updated_at
  BEFORE UPDATE ON badges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- A badge a player currently holds. Written only by sync_player_badges().
CREATE TABLE player_badges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id        UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  earned_on       DATE NOT NULL,
  -- The notification sent for it. No foreign key, as with leaderboard_awards: losing the
  -- badge takes the notification back if it hasn't been read.
  notification_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (badge_id, player_id)
);

CREATE INDEX idx_player_badges_player ON player_badges(player_id);

-- The Beachamp Credits ledger: a player's balance is the sum of their amounts. Merch
-- spending will add negative rows here, so the balance stays in one place.
CREATE TABLE credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL CHECK (amount <> 0),
  description     TEXT NOT NULL,
  -- Set for a badge's credits: they go when the badge does
  player_badge_id UUID REFERENCES player_badges(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_player ON credit_transactions(player_id);

-- ── Row-level security ──

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Players see locked badges too, to know what to aim for
CREATE POLICY "Signed-in users can see badges"
  ON badges FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage badges"
  ON badges FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- No write policies on the next two: only the SECURITY DEFINER sync writes them
ALTER TABLE player_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can see their own badges"
  ON player_badges FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY "Admins can see every player's badges"
  ON player_badges FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can see their own credits"
  ON credit_transactions FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY "Admins can see every player's credits"
  ON credit_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── A badge's measure and start day never change ──
-- Changing either would make it a different badge, judged on different activity.
CREATE FUNCTION badges_freeze_measure() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.measure IS DISTINCT FROM OLD.measure OR NEW.counts_from IS DISTINCT FROM OLD.counts_from THEN
    RAISE EXCEPTION 'A badge''s measure and start day can''t be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER badges_freeze_measure
  BEFORE UPDATE ON badges
  FOR EACH ROW EXECUTE FUNCTION badges_freeze_measure();

-- ── The words for a badge ──
-- The same sentences as badgeDescription() in src/lib/badges/measures.ts
CREATE FUNCTION badge_description(p_measure TEXT, p_threshold INTEGER) RETURNS TEXT AS $$
  SELECT CASE p_measure
    WHEN 'sessions_attended' THEN
      'Attended ' || p_threshold || CASE WHEN p_threshold = 1 THEN ' session' ELSE ' sessions' END
    WHEN 'attendance_streak' THEN p_threshold || ' sessions in a row'
    WHEN 'month_points' THEN p_threshold || '+ points in one month'
    WHEN 'monthly_wins' THEN
      CASE WHEN p_threshold = 1 THEN 'Won a monthly leaderboard'
           ELSE 'Won ' || p_threshold || ' monthly leaderboards' END
  END
$$ LANGUAGE sql IMMUTABLE;

-- ── Where a player stands on one badge ──
-- value:       the player's figure (sessions, best run, best month's points, or wins)
-- current_run: the streak as of the latest marked session (streaks only)
-- earned_on:   the day the threshold was reached, or NULL if it hasn't been
-- Only activity on or after the badge's counts_from day counts.
CREATE FUNCTION badge_measure(p_player UUID, p_badge badges)
RETURNS TABLE (value INTEGER, current_run INTEGER, earned_on DATE) AS $$
DECLARE
  r    RECORD;
  run  INTEGER := 0;
  best INTEGER := 0;
BEGIN
  current_run := NULL;
  earned_on := NULL;

  IF p_badge.measure = 'sessions_attended' THEN
    SELECT count(*)::int,
           (array_agg(a.session_date ORDER BY a.session_date, a.session_time NULLS LAST, a.created_at))[p_badge.threshold]
      INTO value, earned_on
      FROM attendance a
     WHERE a.player_id = p_player AND a.status = 'present' AND a.session_date >= p_badge.counts_from;

  ELSIF p_badge.measure = 'attendance_streak' THEN
    -- present extends the run, absent ends it, excused is skipped. A session the player
    -- wasn't marked for has no row, so it can't break the run.
    FOR r IN
      SELECT a.status, a.session_date
        FROM attendance a
       WHERE a.player_id = p_player AND a.status IN ('present', 'absent')
         AND a.session_date >= p_badge.counts_from
       ORDER BY a.session_date, a.session_time NULLS LAST, a.created_at
    LOOP
      IF r.status = 'present' THEN
        run := run + 1;
        best := GREATEST(best, run);
        IF earned_on IS NULL AND run >= p_badge.threshold THEN
          earned_on := r.session_date;
        END IF;
      ELSE
        run := 0;
      END IF;
    END LOOP;
    value := best;
    current_run := run;

  ELSIF p_badge.measure = 'month_points' THEN
    -- Totals are per group per calendar month, counted live, before the month closes
    WITH s AS (
      SELECT k.session_date, k.points,
             sum(k.points) OVER (PARTITION BY k.group_id, date_trunc('month', k.session_date)) AS total,
             sum(k.points) OVER (PARTITION BY k.group_id, date_trunc('month', k.session_date)
                                 ORDER BY k.session_date, k.created_at, k.id) AS running
        FROM king_of_court_scores k
       WHERE k.player_id = p_player AND k.session_date >= p_badge.counts_from
    )
    SELECT COALESCE(max(s.total), 0)::int, min(s.session_date) FILTER (WHERE s.running >= p_badge.threshold)
      INTO value, earned_on
      FROM s;

  ELSIF p_badge.measure = 'monthly_wins' THEN
    -- 1st places from the badge's own month onwards, dated by when their month was closed
    SELECT count(*)::int,
           (array_agg((c.closed_at AT TIME ZONE 'Africa/Cairo')::date ORDER BY a.month, a.created_at, a.id))[p_badge.threshold]
      INTO value, earned_on
      FROM leaderboard_awards a
      JOIN leaderboard_month_closes c ON c.month = a.month
     WHERE a.player_id = p_player AND a.place = 1
       AND a.month >= to_char(p_badge.counts_from, 'YYYY-MM');
  END IF;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- ── Bring a player's badges in line with their activity ──
-- Newly met: the badge, its credits and a notification. No longer met: the badge goes,
-- and its credits with it (ON DELETE CASCADE). p_badge limits the check to one badge.
-- SECURITY DEFINER: scores are admin-only under RLS, and coaches save attendance with
-- their own client.
CREATE FUNCTION sync_player_badges(p_player UUID, p_badge UUID DEFAULT NULL) RETURNS VOID AS $$
DECLARE
  b       badges;
  m       RECORD;
  held    player_badges;
  pb_id   UUID;
  note_id UUID;
BEGIN
  -- A cascading delete of the player runs after their profile is gone: nothing to do
  IF p_player IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_player) THEN
    RETURN;
  END IF;

  -- One sync per player at a time, so two saves at once can't both award the same badge
  PERFORM pg_advisory_xact_lock(hashtext('player_badges:' || p_player::text));

  FOR b IN SELECT * FROM badges WHERE p_badge IS NULL OR id = p_badge LOOP
    SELECT * INTO m FROM badge_measure(p_player, b);
    SELECT * INTO held FROM player_badges WHERE badge_id = b.id AND player_id = p_player;

    IF m.earned_on IS NOT NULL AND held.id IS NULL THEN
      note_id := gen_random_uuid();
      INSERT INTO player_badges (badge_id, player_id, earned_on, notification_id)
      VALUES (b.id, p_player, m.earned_on, note_id)
      RETURNING id INTO pb_id;

      IF b.credits > 0 THEN
        INSERT INTO credit_transactions (player_id, amount, description, player_badge_id)
        VALUES (p_player, b.credits, b.name || ' badge', pb_id);
      END IF;

      -- The notification webhook emails it in production
      INSERT INTO notifications (id, user_id, title, body, type, link)
      VALUES (
        note_id,
        p_player,
        'You earned the ' || b.name || ' badge',
        badge_description(b.measure, b.threshold) ||
          CASE WHEN b.credits = 0 THEN '.'
               ELSE '. +' || b.credits || CASE WHEN b.credits = 1 THEN ' Beachamp Credit.' ELSE ' Beachamp Credits.' END
          END,
        'system',
        '/player/achievements'
      );

    ELSIF m.earned_on IS NOT NULL THEN
      -- Still held; a correction may have moved the day it was reached
      IF held.earned_on IS DISTINCT FROM m.earned_on THEN
        UPDATE player_badges SET earned_on = m.earned_on WHERE id = held.id;
      END IF;

    ELSIF held.id IS NOT NULL THEN
      DELETE FROM player_badges WHERE id = held.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Losing a badge takes back its notification, if unread ──
-- Covers every way a badge goes: the sync, the badge being deleted, the player being deleted.
CREATE FUNCTION player_badges_drop_notification() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.notification_id IS NOT NULL THEN
    DELETE FROM notifications WHERE id = OLD.notification_id AND is_read = FALSE;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER player_badges_drop_notification
  AFTER DELETE ON player_badges
  FOR EACH ROW EXECUTE FUNCTION player_badges_drop_notification();

-- ── Re-check a player whenever their attendance, scores or awards change ──
-- A failed sync is logged and swallowed: a badge problem must never stop a coach saving
-- attendance or an admin closing a month. Its subtransaction rolls back, notifications
-- included, so nothing half-done is emailed. The player catches up on their next change.
CREATE FUNCTION badges_sync_on_activity() RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    IF TG_OP <> 'DELETE' THEN
      PERFORM sync_player_badges(NEW.player_id);
    END IF;
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.player_id IS DISTINCT FROM NEW.player_id) THEN
      PERFORM sync_player_badges(OLD.player_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'badges: could not re-check badges after % on %: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER attendance_sync_badges
  AFTER INSERT OR DELETE OR UPDATE OF status, session_date, session_time, player_id ON attendance
  FOR EACH ROW EXECUTE FUNCTION badges_sync_on_activity();

CREATE TRIGGER king_of_court_scores_sync_badges
  AFTER INSERT OR UPDATE OR DELETE ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION badges_sync_on_activity();

CREATE TRIGGER leaderboard_awards_sync_badges
  AFTER INSERT OR DELETE ON leaderboard_awards
  FOR EACH ROW EXECUTE FUNCTION badges_sync_on_activity();

-- ── A new badge, or a new number, re-checks everyone it could affect ──
-- Candidates: anyone with activity since the badge's start day, and anyone holding it.
-- Errors are not swallowed here, so the admin sees why a save failed.
CREATE FUNCTION badges_sync_badge() RETURNS TRIGGER AS $$
DECLARE
  p UUID;
BEGIN
  FOR p IN
    SELECT player_id FROM attendance WHERE session_date >= NEW.counts_from
    UNION
    SELECT player_id FROM king_of_court_scores WHERE session_date >= NEW.counts_from
    UNION
    SELECT player_id FROM leaderboard_awards WHERE month >= to_char(NEW.counts_from, 'YYYY-MM')
    UNION
    SELECT player_id FROM player_badges WHERE badge_id = NEW.id
  LOOP
    PERFORM sync_player_badges(p, NEW.id);
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER badges_sync
  AFTER INSERT OR UPDATE OF threshold ON badges
  FOR EACH ROW EXECUTE FUNCTION badges_sync_badge();

-- ── The signed-in player's progress toward every badge ──
-- For the locked badges on the Achievements page. SECURITY DEFINER so King of Court
-- scores (admin-only under RLS) count, but only ever for auth.uid().
CREATE FUNCTION my_badge_progress()
RETURNS TABLE (badge_id UUID, value INTEGER, current_run INTEGER) AS $$
  SELECT b.id, m.value, m.current_run
    FROM badges b
   CROSS JOIN LATERAL badge_measure(auth.uid(), b) m
   WHERE auth.uid() IS NOT NULL
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Who may call what ──
-- The sync and the measure answer for any player, so only the database calls them.
REVOKE EXECUTE ON FUNCTION sync_player_badges(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION badge_measure(UUID, badges) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION my_badge_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_badge_progress() TO authenticated;
