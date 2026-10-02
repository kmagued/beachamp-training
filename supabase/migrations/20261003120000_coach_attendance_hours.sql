-- ═══════════════════════════════════════════════════════════════
-- Coach attendance hours (2026-10-03)
--   Snapshots how long each session ran when a coach's attendance is
--   first saved, so coach pay for a past month doesn't change when a
--   session's start or end time is edited later.
--
--   Filled by a BEFORE INSERT trigger. submitCoachAttendance upserts
--   without `hours`, so a re-save (e.g. absent → present) keeps the
--   original snapshot. Whether a row is paid is decided when reading
--   (present only); hours are stored whatever the status.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE coach_attendance ADD COLUMN hours NUMERIC(5,2);

-- A session's length in hours. An end at or before the start runs past
-- midnight (22:00–00:00 is 2 hours), matching sessionHours() in
-- src/lib/coach-pay/hours.ts.
CREATE OR REPLACE FUNCTION session_length_hours(p_start TIME, p_end TIME)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
  SELECT ROUND(
    (EXTRACT(EPOCH FROM (p_end - p_start)) / 3600
      + CASE WHEN p_end <= p_start THEN 24 ELSE 0 END)::numeric,
    2
  )
$$;

-- ── Snapshot on first save ──
CREATE OR REPLACE FUNCTION coach_attendance_set_hours()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hours IS NULL THEN
    SELECT session_length_hours(s.start_time, s.end_time) INTO NEW.hours
    FROM schedule_sessions s
    WHERE s.id = NEW.schedule_session_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER coach_attendance_set_hours
  BEFORE INSERT ON coach_attendance
  FOR EACH ROW EXECUTE FUNCTION coach_attendance_set_hours();

-- ── Backfill from the sessions' current times ──
UPDATE coach_attendance ca
SET hours = session_length_hours(s.start_time, s.end_time)
FROM schedule_sessions s
WHERE s.id = ca.schedule_session_id
  AND ca.hours IS NULL;
