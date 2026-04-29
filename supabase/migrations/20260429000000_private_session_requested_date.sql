-- Players now pick an actual date when requesting a private session,
-- so we can show real reservations on a date calendar instead of a recurring weekly grid.
ALTER TABLE private_session_requests
  ADD COLUMN requested_date DATE;

CREATE INDEX idx_private_session_requests_date ON private_session_requests(requested_date);
