-- Data repair for the "edited private session disappears from the schedule" bug.
--
-- Root cause: updateScheduleSession() read day_of_week from a form field that the
-- edit drawer never renders, so Number(null) === 0 silently reset day_of_week to 0
-- (Sunday) on every edit. For a private (one-off) session the calendar only renders
-- it on the weekday that matches its end_date, so a clobbered day_of_week makes it
-- vanish from the schedule while still appearing in the confirmed-sessions list
-- (that list filters only on end_date + is_active, never day_of_week).
--
-- For private sessions, day_of_week must ALWAYS equal the weekday of end_date.
-- Postgres EXTRACT(DOW) returns 0=Sunday..6=Saturday, matching JS Date.getDay(),
-- which is what the application uses. This statement is safe and idempotent: it only
-- touches private sessions whose stored day_of_week disagrees with their end_date.
UPDATE schedule_sessions
SET day_of_week = EXTRACT(DOW FROM end_date::date)::int
WHERE session_type = 'private'
  AND end_date IS NOT NULL
  AND day_of_week <> EXTRACT(DOW FROM end_date::date)::int;

-- NOTE: Group (recurring) sessions edited via the same drawer may also have had
-- day_of_week reset to 0 (Sunday). Those CANNOT be auto-repaired, because for a
-- recurring session end_date is an expiry, not the recurrence day — there is no
-- source of truth for the original weekday in the row itself. Review them manually:
--
--   SELECT s.id, g.name, s.day_of_week, s.start_time, s.end_date
--   FROM schedule_sessions s
--   LEFT JOIN groups g ON g.id = s.group_id
--   WHERE s.session_type = 'group' AND s.is_active AND s.day_of_week = 0;
--
-- Cross-check each against its group's intended training day (or the weekday of its
-- attendance records) before correcting.
