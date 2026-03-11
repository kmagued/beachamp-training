-- ══════════════════════════════════════════════════════
-- Add end_date to schedule_sessions
-- Schedules should not repeat indefinitely
-- ══════════════════════════════════════════════════════

ALTER TABLE schedule_sessions ADD COLUMN end_date DATE;

-- Create index for filtering active schedules by end_date
CREATE INDEX idx_schedule_end_date ON schedule_sessions(end_date);
