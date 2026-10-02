-- ═══════════════════════════════════════════════════════════════
-- Badges, badge tiers and Beachamp Credits (2026-10-02)
--   An admin defines badges: a measure (sessions attended, attendance
--   streak, points in one month, monthly wins) and 1 to 5 tiers, Bronze to
--   Diamond, each with its own number and credits. Players earn tiers
--   automatically, and each tier pays out Beachamp Credits, a balance a
--   later build will let players spend on merch.
--
--   A tier is held only while the player meets it. Triggers on attendance,
--   King of Court scores and monthly awards re-check the player on every
--   change, so a correction can take a tier (and its credits) back.
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
  -- Only activity on or after this Cairo date counts toward any of the badge's tiers
  counts_from DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Cairo')::date,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX badges_name_unique ON badges (lower(btrim(name)));

CREATE TRIGGER badges_updated_at
  BEFORE UPDATE ON badges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 1 Bronze, 2 Silver, 3 Gold, 4 Platinum, 5 Diamond. A badge's tiers are 1..n with no
-- gaps and rising numbers; save_badge() is the only writer and enforces both.
CREATE TABLE badge_tiers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id   UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  tier       SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 5),
  threshold  INTEGER NOT NULL CHECK (threshold BETWEEN 1 AND 1000),
  credits    INTEGER NOT NULL DEFAULT 0 CHECK (credits BETWEEN 0 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (badge_id, tier)
);

-- A tier a player currently holds. Written only by sync_player_badges().
CREATE TABLE player_badges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_tier_id   UUID NOT NULL REFERENCES badge_tiers(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  earned_on       DATE NOT NULL,
  -- The notification sent for it. No foreign key, as with leaderboard_awards: losing the
  -- tier takes the notification back if it hasn't been read.
  notification_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (badge_tier_id, player_id)
);

CREATE INDEX idx_player_badges_player ON player_badges(player_id);

-- The Beachamp Credits ledger: a player's balance is the sum of their amounts. Merch
-- spending will add negative rows here, so the balance stays in one place.
CREATE TABLE credit_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL CHECK (amount <> 0),
  description     TEXT NOT NULL,
  -- Set for a tier's credits: they go when the tier does
  player_badge_id UUID REFERENCES player_badges(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_player ON credit_transactions(player_id);
CREATE INDEX idx_credit_transactions_player_badge ON credit_transactions(player_badge_id);

-- ── Row-level security ──
-- No write policies anywhere: badges are saved through save_badge() by the server (service
-- role), and player_badges / credit_transactions are written only by the sync.

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

-- Players see locked badges too, to know what to aim for
CREATE POLICY "Signed-in users can see badges"
  ON badges FOR SELECT
  USING (auth.uid() IS NOT NULL);

ALTER TABLE badge_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can see badge tiers"
  ON badge_tiers FOR SELECT
  USING (auth.uid() IS NOT NULL);

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

-- ── The words for a tier ──
-- The same names as TIERS in src/lib/badges/config.ts
CREATE FUNCTION tier_name(p_tier INTEGER) RETURNS TEXT AS $$
  SELECT (ARRAY['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'])[p_tier]
$$ LANGUAGE sql IMMUTABLE;

-- The same sentences as badgeDescription() in src/lib/badges/words.ts
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

-- ── Where a player stands on one badge, for every tier at once ──
-- value:        the player's figure (sessions, best run, best month's points, or wins)
-- current_run:  the streak as of the latest marked session (streaks only)
-- reached_on[i]: the day p_thresholds[i] was reached, or NULL if it hasn't been
-- Only activity on or after the badge's counts_from day counts.
CREATE FUNCTION badge_measure(p_player UUID, p_badge badges, p_thresholds INTEGER[])
RETURNS TABLE (value INTEGER, current_run INTEGER, reached_on DATE[]) AS $$
DECLARE
  r     RECORD;
  run   INTEGER := 0;
  best  INTEGER := 0;
  dates DATE[];
  n     INTEGER := coalesce(array_length(p_thresholds, 1), 0);
  i     INTEGER;
BEGIN
  current_run := NULL;
  reached_on := array_fill(NULL::date, ARRAY[n]);

  IF p_badge.measure = 'sessions_attended' THEN
    SELECT count(*)::int, array_agg(a.session_date ORDER BY a.session_date, a.session_time NULLS LAST, a.created_at)
      INTO value, dates
      FROM attendance a
     WHERE a.player_id = p_player AND a.status = 'present' AND a.session_date >= p_badge.counts_from;
    FOR i IN 1..n LOOP
      reached_on[i] := dates[p_thresholds[i]];
    END LOOP;

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
        FOR i IN 1..n LOOP
          IF reached_on[i] IS NULL AND run >= p_thresholds[i] THEN
            reached_on[i] := r.session_date;
          END IF;
        END LOOP;
      ELSE
        run := 0;
      END IF;
    END LOOP;
    value := best;
    current_run := run;

  ELSIF p_badge.measure = 'month_points' THEN
    -- Totals are per group per calendar month, counted live, before the month closes.
    -- Points are never negative, so a running total that reaches N stays at or above it.
    WITH s AS (
      SELECT k.session_date,
             sum(k.points) OVER (PARTITION BY k.group_id, date_trunc('month', k.session_date)) AS total,
             sum(k.points) OVER (PARTITION BY k.group_id, date_trunc('month', k.session_date)
                                 ORDER BY k.session_date, k.created_at, k.id) AS running
        FROM king_of_court_scores k
       WHERE k.player_id = p_player AND k.session_date >= p_badge.counts_from
    )
    SELECT (SELECT COALESCE(max(s.total), 0)::int FROM s),
           ARRAY(SELECT (SELECT min(s.session_date) FROM s WHERE s.running >= u.t)
                   FROM unnest(p_thresholds) WITH ORDINALITY AS u(t, o)
                  ORDER BY u.o)
      INTO value, reached_on;

  ELSIF p_badge.measure = 'monthly_wins' THEN
    -- 1st places from the badge's own month onwards, dated by when their month was closed
    SELECT count(*)::int,
           array_agg((c.closed_at AT TIME ZONE 'Africa/Cairo')::date ORDER BY a.month, a.created_at, a.id)
      INTO value, dates
      FROM leaderboard_awards a
      JOIN leaderboard_month_closes c ON c.month = a.month
     WHERE a.player_id = p_player AND a.place = 1
       AND a.month >= to_char(p_badge.counts_from, 'YYYY-MM');
    FOR i IN 1..n LOOP
      reached_on[i] := dates[p_thresholds[i]];
    END LOOP;
  END IF;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- ── Bring a player's tiers in line with their activity ──
-- Newly met: the tier, its credits and a notification. No longer met: the tier goes,
-- and its credits with it (ON DELETE CASCADE). p_badge limits the check to one badge.
-- SECURITY DEFINER: scores are admin-only under RLS, and coaches save attendance with
-- their own client.
CREATE FUNCTION sync_player_badges(p_player UUID, p_badge UUID DEFAULT NULL) RETURNS VOID AS $$
DECLARE
  b          badges;
  tier_ids   UUID[];
  tiers      SMALLINT[];
  thresholds INTEGER[];
  credits    INTEGER[];
  m          RECORD;
  held       player_badges;
  pb_id      UUID;
  note_id    UUID;
  i          INTEGER;
BEGIN
  -- A cascading delete of the player runs after their profile is gone: nothing to do
  IF p_player IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_player) THEN
    RETURN;
  END IF;

  -- One sync per player at a time, so two saves at once can't both award the same tier
  PERFORM pg_advisory_xact_lock(hashtext('player_badges:' || p_player::text));

  FOR b IN SELECT * FROM badges WHERE p_badge IS NULL OR id = p_badge LOOP
    SELECT array_agg(t.id ORDER BY t.tier), array_agg(t.tier ORDER BY t.tier),
           array_agg(t.threshold ORDER BY t.tier), array_agg(t.credits ORDER BY t.tier)
      INTO tier_ids, tiers, thresholds, credits
      FROM badge_tiers t
     WHERE t.badge_id = b.id;
    CONTINUE WHEN tier_ids IS NULL;

    SELECT * INTO m FROM badge_measure(p_player, b, thresholds);

    FOR i IN 1..array_length(tier_ids, 1) LOOP
      SELECT * INTO held FROM player_badges WHERE badge_tier_id = tier_ids[i] AND player_id = p_player;

      IF m.reached_on[i] IS NOT NULL AND held.id IS NULL THEN
        note_id := gen_random_uuid();
        INSERT INTO player_badges (badge_tier_id, player_id, earned_on, notification_id)
        VALUES (tier_ids[i], p_player, m.reached_on[i], note_id)
        RETURNING id INTO pb_id;

        IF credits[i] > 0 THEN
          INSERT INTO credit_transactions (player_id, amount, description, player_badge_id)
          VALUES (p_player, credits[i], b.name || ' badge (' || tier_name(tiers[i]) || ')', pb_id);
        END IF;

        -- The notification webhook emails it in production
        INSERT INTO notifications (id, user_id, title, body, type, link)
        VALUES (
          note_id,
          p_player,
          'You earned the ' || tier_name(tiers[i]) || ' ' || b.name || ' badge',
          badge_description(b.measure, thresholds[i]) ||
            CASE WHEN credits[i] = 0 THEN '.'
                 ELSE '. +' || credits[i] || CASE WHEN credits[i] = 1 THEN ' Beachamp Credit.' ELSE ' Beachamp Credits.' END
            END,
          'system',
          '/player/achievements'
        );

      ELSIF m.reached_on[i] IS NOT NULL THEN
        -- Still held; a correction may have moved the day it was reached
        IF held.earned_on IS DISTINCT FROM m.reached_on[i] THEN
          UPDATE player_badges SET earned_on = m.reached_on[i] WHERE id = held.id;
        END IF;

      ELSIF held.id IS NOT NULL THEN
        DELETE FROM player_badges WHERE id = held.id;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Losing a tier takes back its notification, if unread ──
-- Covers every way a tier goes: the sync, a tier or badge being deleted, the player being
-- deleted.
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
-- included, so nothing half-done is emailed. The player catches up on their next change,
-- or when an admin next saves the badge.
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

-- ── Create or edit a badge and its tiers, in one go ──
-- p_tiers: [{"threshold": 10, "credits": 20}, ...], Bronze first. The rules match
-- validateBadge() in src/lib/badges/validate.ts; refusals are check_violations whose
-- message is shown to the admin as it is. Afterwards everyone the badge could affect is
-- re-checked (errors not swallowed, so the admin sees why a save failed). Saving an
-- unchanged badge is therefore also a way to re-check it.
CREATE FUNCTION save_badge(
  p_id         UUID,
  p_name       TEXT,
  p_icon       TEXT,
  p_measure    TEXT,
  p_tiers      JSONB,
  p_created_by UUID
) RETURNS UUID AS $$
DECLARE
  b         badges;
  n         INTEGER := coalesce(jsonb_array_length(p_tiers), 0);
  min_first INTEGER;
  prev      INTEGER := 0;
  thr       INTEGER;
  cr        INTEGER;
  k         INTEGER;
  p         UUID;
BEGIN
  IF n < 1 THEN
    RAISE EXCEPTION 'Add at least one tier' USING ERRCODE = 'check_violation';
  END IF;
  IF n > 5 THEN
    RAISE EXCEPTION 'A badge has at most 5 tiers' USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO badges (name, icon, measure, created_by)
    VALUES (btrim(p_name), p_icon, p_measure, p_created_by)
    RETURNING * INTO b;
  ELSE
    SELECT * INTO b FROM badges WHERE id = p_id FOR UPDATE;
    IF b.id IS NULL THEN
      RAISE EXCEPTION 'That badge no longer exists' USING ERRCODE = 'check_violation';
    END IF;
    IF b.measure <> p_measure THEN
      RAISE EXCEPTION 'A badge''s measure can''t be changed' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE badges SET name = btrim(p_name), icon = p_icon WHERE id = p_id RETURNING * INTO b;
  END IF;

  min_first := CASE WHEN b.measure = 'attendance_streak' THEN 2 ELSE 1 END;
  FOR k IN 1..n LOOP
    thr := (p_tiers -> (k - 1) ->> 'threshold')::int;
    cr := coalesce((p_tiers -> (k - 1) ->> 'credits')::int, 0);
    IF thr IS NULL OR thr < min_first OR thr > 1000 THEN
      RAISE EXCEPTION '%: enter a whole number from % to 1000', tier_name(k), min_first
        USING ERRCODE = 'check_violation';
    END IF;
    IF thr <= prev THEN
      RAISE EXCEPTION '% needs a higher number than %', tier_name(k), tier_name(k - 1)
        USING ERRCODE = 'check_violation';
    END IF;
    IF cr < 0 OR cr > 10000 THEN
      RAISE EXCEPTION '%: enter a whole number of credits from 0 to 10000', tier_name(k)
        USING ERRCODE = 'check_violation';
    END IF;
    prev := thr;

    INSERT INTO badge_tiers (badge_id, tier, threshold, credits)
    VALUES (b.id, k, thr, cr)
    ON CONFLICT (badge_id, tier) DO UPDATE SET threshold = EXCLUDED.threshold, credits = EXCLUDED.credits;
  END LOOP;

  -- Tiers removed from the top: their holders lose them (cascade)
  DELETE FROM badge_tiers WHERE badge_id = b.id AND tier > n;

  -- Ordered, so concurrent saves take players' advisory locks in the same order
  FOR p IN
    SELECT c.player_id FROM (
      SELECT player_id FROM attendance WHERE session_date >= b.counts_from
      UNION
      SELECT player_id FROM king_of_court_scores WHERE session_date >= b.counts_from
      UNION
      SELECT player_id FROM leaderboard_awards WHERE month >= to_char(b.counts_from, 'YYYY-MM')
      UNION
      SELECT pb.player_id FROM player_badges pb JOIN badge_tiers t ON t.id = pb.badge_tier_id WHERE t.badge_id = b.id
    ) c
    ORDER BY c.player_id
  LOOP
    PERFORM sync_player_badges(p, b.id);
  END LOOP;

  RETURN b.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── Per badge: how many players hold any tier, and the credits actually paid ──
-- SECURITY INVOKER: an admin sees every player's rows under RLS; anyone else sees only
-- their own.
CREATE FUNCTION badge_summaries()
RETURNS TABLE (badge_id UUID, holders INTEGER, credits_paid INTEGER) AS $$
  SELECT t.badge_id, count(DISTINCT pb.player_id)::int, COALESCE(sum(c.amount), 0)::int
    FROM badge_tiers t
    JOIN player_badges pb ON pb.badge_tier_id = t.id
    LEFT JOIN credit_transactions c ON c.player_badge_id = pb.id
   GROUP BY t.badge_id
$$ LANGUAGE sql STABLE SET search_path = public;

-- ── The signed-in player's progress toward every badge ──
-- For the locked tiers on the Achievements page. SECURITY DEFINER so King of Court
-- scores (admin-only under RLS) count, but only ever for auth.uid().
CREATE FUNCTION my_badge_progress()
RETURNS TABLE (badge_id UUID, value INTEGER, current_run INTEGER) AS $$
  SELECT b.id, m.value, m.current_run
    FROM badges b
   CROSS JOIN LATERAL badge_measure(auth.uid(), b, '{}'::int[]) m
   WHERE auth.uid() IS NOT NULL
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Who may call what ──
-- The sync and the measure answer for any player, so only the database calls them.
-- save_badge trusts its caller to be an admin: only the server (service role) may call it.
REVOKE EXECUTE ON FUNCTION sync_player_badges(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION badge_measure(UUID, badges, INTEGER[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION save_badge(UUID, TEXT, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_badge(UUID, TEXT, TEXT, TEXT, JSONB, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION my_badge_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_badge_progress() TO authenticated;
