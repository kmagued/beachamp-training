-- Add group_id to feedback table for session/group context
ALTER TABLE feedback ADD COLUMN group_id UUID REFERENCES groups(id);

CREATE INDEX idx_feedback_group ON feedback(group_id);

-- Backfill existing feedback with group_id from attendance records
UPDATE feedback
SET group_id = attendance.group_id
FROM attendance
WHERE feedback.player_id = attendance.player_id
  AND feedback.session_date = attendance.session_date
  AND attendance.group_id IS NOT NULL
  AND feedback.group_id IS NULL;

-- Allow players to view coach profiles (needed for feedback page to show coach names)
CREATE POLICY "Players can view coach profiles"
  ON profiles FOR SELECT
  USING (
    auth_role() = 'player'
    AND role IN ('coach', 'admin')
  );
