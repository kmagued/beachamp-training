-- ═══════════════════════════════════════════
-- Attendance & Feedback tables (Phase 2 prep)
-- ═══════════════════════════════════════════

-- ATTENDANCE
CREATE TABLE attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id     UUID REFERENCES groups(id),
  session_date DATE NOT NULL,
  session_time TIME,
  status       TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')) DEFAULT 'present',
  marked_by    UUID REFERENCES profiles(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_attendance_player ON attendance(player_id);
CREATE INDEX idx_attendance_date ON attendance(session_date);
CREATE INDEX idx_attendance_group ON attendance(group_id);

-- Prevent duplicate entries for same player + group + date
CREATE UNIQUE INDEX idx_attendance_unique_session
  ON attendance(player_id, group_id, session_date);

-- RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own attendance"
  ON attendance FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "Coaches and admins can manage attendance"
  ON attendance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('coach', 'admin')
    )
  );

-- FEEDBACK
CREATE TABLE feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id     UUID NOT NULL REFERENCES profiles(id),
  session_date DATE NOT NULL,
  rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_player ON feedback(player_id);
CREATE INDEX idx_feedback_coach ON feedback(coach_id);
CREATE INDEX idx_feedback_date ON feedback(session_date);

-- RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own feedback"
  ON feedback FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "Coaches and admins can manage feedback"
  ON feedback FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('coach', 'admin')
    )
  );
