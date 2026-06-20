-- Link a payment to a specific private session (per-session charge).
ALTER TABLE payments
  ADD COLUMN schedule_session_id UUID REFERENCES schedule_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_payments_schedule_session ON payments(schedule_session_id);
