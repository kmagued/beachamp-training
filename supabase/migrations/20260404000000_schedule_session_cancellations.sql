-- Per-date cancellations for recurring schedule sessions
-- Allows cancelling a single occurrence without deleting the entire recurring session
CREATE TABLE schedule_session_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  cancelled_date DATE NOT NULL,
  reason TEXT DEFAULT NULL,
  cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(schedule_session_id, cancelled_date)
);

-- RLS
ALTER TABLE schedule_session_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view cancellations"
  ON schedule_session_cancellations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage cancellations"
  ON schedule_session_cancellations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE INDEX idx_cancellations_session_date
  ON schedule_session_cancellations(schedule_session_id, cancelled_date);
