-- ═══════════════════════════════════════════════════════════════
-- King of Court scores (2026-09-28)
--   Points each present player scored in a group session's King of Court
--   game, logged by an admin from the Daily Report. Summed per group per
--   calendar month for the admin leaderboard.
--
--   A blank score means the player didn't play and has no row; 0 is stored.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE king_of_court_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  -- The group the player attended under. Copied rather than joined so that editing a
  -- session's group later never moves points between leaderboards.
  group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  session_date        DATE NOT NULL,
  points              INTEGER NOT NULL CHECK (points BETWEEN 0 AND 999),
  entered_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One score per player per session occurrence; re-saving upserts
  UNIQUE (player_id, schedule_session_id, session_date)
);

-- ── Indexes ──
CREATE INDEX idx_kotc_scores_group_date ON king_of_court_scores(group_id, session_date);
CREATE INDEX idx_kotc_scores_session ON king_of_court_scores(schedule_session_id, session_date);

-- ── Updated-at trigger (reuses the existing function) ──
CREATE TRIGGER king_of_court_scores_updated_at
  BEFORE UPDATE ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security: admins only; coaches and players see nothing ──
ALTER TABLE king_of_court_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage king of court scores"
  ON king_of_court_scores FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── A score needs a present attendance row for the same occurrence ──
CREATE FUNCTION kotc_require_present() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM attendance
    WHERE player_id = NEW.player_id
      AND schedule_session_id = NEW.schedule_session_id
      AND session_date = NEW.session_date
      AND status = 'present'
  ) THEN
    RAISE EXCEPTION 'Player % was not marked present for this session', NEW.player_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER king_of_court_scores_require_present
  BEFORE INSERT OR UPDATE OF player_id, schedule_session_id, session_date
  ON king_of_court_scores
  FOR EACH ROW EXECUTE FUNCTION kotc_require_present();

-- ── Attendance removed, or changed away from present → drop the score ──
-- log_attendance_with_deduction updates rows in place, so re-saving attendance as
-- present never reaches the DELETE below.
-- SECURITY DEFINER: updateAttendanceRecord runs with the caller's own client, and a
-- coach's RLS would otherwise silently filter this DELETE down to nothing.
CREATE FUNCTION kotc_drop_score_on_attendance_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD.status = 'present' AND NEW.status <> 'present') THEN
    DELETE FROM king_of_court_scores
    WHERE player_id = OLD.player_id
      AND schedule_session_id = OLD.schedule_session_id
      AND session_date = OLD.session_date;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER attendance_drop_kotc_score
  AFTER DELETE OR UPDATE OF status ON attendance
  FOR EACH ROW EXECUTE FUNCTION kotc_drop_score_on_attendance_change();
