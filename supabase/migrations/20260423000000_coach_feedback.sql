-- Player → Coach feedback
CREATE TABLE coach_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coach_feedback_coach ON coach_feedback(coach_id);
CREATE INDEX idx_coach_feedback_player ON coach_feedback(player_id);

ALTER TABLE coach_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can insert their own coach feedback"
  ON coach_feedback FOR INSERT
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Players can view their own coach feedback"
  ON coach_feedback FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "Coaches can view feedback about themselves"
  ON coach_feedback FOR SELECT
  USING (auth.uid() = coach_id);

CREATE POLICY "Admins can manage all coach feedback"
  ON coach_feedback FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );
