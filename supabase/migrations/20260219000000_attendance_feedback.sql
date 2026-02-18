-- ATTENDANCE (for Phase 1 sessions screen — coaches log in Phase 2, seed sample data now)
CREATE TABLE attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id    UUID REFERENCES groups(id),
  session_date DATE NOT NULL,
  session_time TIME,
  status      TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')) DEFAULT 'present',
  marked_by   UUID REFERENCES profiles(id),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attendance_player ON attendance(player_id);
CREATE INDEX idx_attendance_date ON attendance(session_date);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own attendance"
  ON attendance FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY "Coaches can manage attendance"
  ON attendance FOR ALL USING (auth_role() IN ('coach', 'admin'));
CREATE POLICY "Admins can manage all attendance"
  ON attendance FOR ALL USING (auth_role() = 'admin');

-- FEEDBACK (coach → player feedback)
CREATE TABLE feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id    UUID NOT NULL REFERENCES profiles(id),
  session_date DATE NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_player ON feedback(player_id);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own feedback"
  ON feedback FOR SELECT USING (auth.uid() = player_id);
CREATE POLICY "Coaches can manage feedback"
  ON feedback FOR ALL USING (auth_role() IN ('coach', 'admin'));
CREATE POLICY "Admins can view all feedback"
  ON feedback FOR SELECT USING (auth_role() = 'admin');
