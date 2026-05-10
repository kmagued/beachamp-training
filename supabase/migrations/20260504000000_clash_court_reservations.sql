-- Track The Clash partner reservations on private sessions.
--
-- When an admin schedules a private session and picks a Clash court, we
-- create a reservation on api.theclasheg.com via the Public Partner API and
-- store the resulting reservation id alongside our schedule_session row so
-- we can cancel it later when the session is cancelled.
--
-- Existing free-text `location` is kept as-is for sessions that don't go
-- through Clash (e.g. away venues). For Clash-backed sessions, `location`
-- is set to `clash_court_name` for display continuity.

ALTER TABLE schedule_sessions
  ADD COLUMN clash_court_id UUID,
  ADD COLUMN clash_court_name TEXT,
  ADD COLUMN clash_reservation_id UUID;

CREATE INDEX idx_schedule_sessions_clash_reservation
  ON schedule_sessions(clash_reservation_id)
  WHERE clash_reservation_id IS NOT NULL;
