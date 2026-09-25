-- ═══════════════════════════════════════════════════════════════
-- Coach attendance (2026-09-25)
--   Which coaches actually ran each session, logged by an admin from
--   the daily report. Mirrors `attendance`, but keyed on the coach.
--
--   `schedule_sessions.coach_id` records who was *assigned*; this table
--   records who *turned up*, so substitutes and second coaches are captured.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE coach_attendance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  session_date        DATE NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')) DEFAULT 'present',
  marked_by           UUID REFERENCES profiles(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One row per coach per session occurrence, so re-saving a session upserts
  -- rather than piling up duplicates.
  UNIQUE (coach_id, schedule_session_id, session_date)
);

-- ── Indexes ──
CREATE INDEX idx_coach_attendance_date ON coach_attendance(session_date);
CREATE INDEX idx_coach_attendance_coach ON coach_attendance(coach_id);
CREATE INDEX idx_coach_attendance_session ON coach_attendance(schedule_session_id);

-- ── Updated-at trigger (reuses the existing function) ──
CREATE TRIGGER coach_attendance_updated_at
  BEFORE UPDATE ON coach_attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security ──
ALTER TABLE coach_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coach attendance"
  ON coach_attendance FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- A coach may read their own record, but not write it — logging stays with admins.
CREATE POLICY "Coaches can view their own attendance"
  ON coach_attendance FOR SELECT
  USING (coach_id = auth.uid());
