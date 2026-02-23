-- Allow 00:00 (midnight) as a valid end_time for sessions that end at midnight
ALTER TABLE schedule_sessions
  DROP CONSTRAINT valid_time_range;

ALTER TABLE schedule_sessions
  ADD CONSTRAINT valid_time_range CHECK (end_time > start_time OR end_time = '00:00:00');
