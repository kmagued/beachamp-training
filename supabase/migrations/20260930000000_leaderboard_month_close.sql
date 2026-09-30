-- ═══════════════════════════════════════════════════════════════
-- Closing a leaderboard month, and the awards it gives (2026-09-30)
--   An admin closes a month from the Leaderboard. That locks the month's
--   King of Court scores and awards the top two players of every group.
--   Reopening deletes the close row: the awards go with it and the scores
--   unlock, so awards always match the leaderboard.
--   Nothing is closed until an admin uses the button, so this is safe to
--   apply ahead of the code.
-- ═══════════════════════════════════════════════════════════════

-- A row here means the month is closed: its scores are locked and its awards are final.
CREATE TABLE leaderboard_month_closes (
  month     TEXT PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- "YYYY-MM"
  closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per awarded player per group per closed month. Reopening deletes the month's
-- close row, and these go with it.
CREATE TABLE leaderboard_awards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month           TEXT NOT NULL REFERENCES leaderboard_month_closes(month) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  place           SMALLINT NOT NULL CHECK (place IN (1, 2)),
  -- The player's month as it stood at closing, shown on the award card
  points          INTEGER NOT NULL,
  sessions        INTEGER NOT NULL,
  -- The notification sent for this award, so reopening can take back the unread ones.
  -- No foreign key: the award is written before its notification, so that a close which
  -- fails part-way never leaves a player notified (and emailed) about an award they
  -- don't have.
  notification_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (month, group_id, player_id)
);

CREATE INDEX idx_leaderboard_awards_player ON leaderboard_awards(player_id, month DESC);

-- ── Row-level security ──
ALTER TABLE leaderboard_month_closes ENABLE ROW LEVEL SECURITY;

-- Whether a month is closed is not a secret: every portal's Leaderboard shows it
CREATE POLICY "Signed-in users can see closed months"
  ON leaderboard_month_closes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage closed months"
  ON leaderboard_month_closes FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE leaderboard_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can see their own awards"
  ON leaderboard_awards FOR SELECT
  USING (player_id = auth.uid());

CREATE POLICY "Admins can manage awards"
  ON leaderboard_awards FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── The lock: a closed month's scores cannot be added, changed or removed ──
-- The trigger's name sorts before king_of_court_scores_require_present, so it fires
-- first: in a closed month the refusal says the month is closed, which is the thing the
-- admin can act on.
-- SECURITY DEFINER: it reads and locks leaderboard_month_closes whoever the caller is
-- (a coach's attendance change reaches it through attendance_drop_kotc_score).
CREATE FUNCTION kotc_refuse_closed_month() RETURNS TRIGGER AS $$
DECLARE
  d     DATE;
  dates DATE[];
BEGIN
  -- A player, group or session being deleted takes its scores with it, closed month or
  -- not. A cascading delete runs after its parent row is gone, so the parent is missing.
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = OLD.player_id)
       OR NOT EXISTS (SELECT 1 FROM groups WHERE id = OLD.group_id)
       OR NOT EXISTS (SELECT 1 FROM schedule_sessions WHERE id = OLD.schedule_session_id) THEN
      RETURN OLD;
    END IF;
  END IF;

  -- Wait for a close that is being written, and make a close wait for this write, so the
  -- awards are never ranked from scores that change a moment later. SHARE doesn't block
  -- other score writes, only writes to leaderboard_month_closes.
  LOCK TABLE leaderboard_month_closes IN SHARE MODE;

  IF TG_OP = 'INSERT' THEN
    dates := ARRAY[NEW.session_date];
  ELSIF TG_OP = 'DELETE' THEN
    dates := ARRAY[OLD.session_date];
  ELSE
    dates := ARRAY[OLD.session_date, NEW.session_date];
  END IF;

  FOREACH d IN ARRAY dates LOOP
    IF EXISTS (SELECT 1 FROM leaderboard_month_closes WHERE month = to_char(d, 'YYYY-MM')) THEN
      -- The same sentence as closedMonthMessage() in src/lib/king-of-court/awards.ts
      RAISE EXCEPTION
        'The % leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard.',
        to_char(d, 'FMMonth YYYY')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER king_of_court_scores_refuse_closed_month
  BEFORE INSERT OR UPDATE OR DELETE ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION kotc_refuse_closed_month();
