-- Make private sessions first-class entries on schedule_sessions so they show up
-- on the schedule and daily report without belonging to a group.

ALTER TABLE schedule_sessions
  ALTER COLUMN group_id DROP NOT NULL,
  ADD COLUMN session_type TEXT NOT NULL DEFAULT 'group'
    CHECK (session_type IN ('group', 'private')),
  ADD COLUMN player_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE schedule_sessions ADD CONSTRAINT schedule_sessions_kind_check CHECK (
  (session_type = 'group' AND group_id IS NOT NULL AND player_id IS NULL)
  OR
  (session_type = 'private' AND player_id IS NOT NULL AND group_id IS NULL)
);

CREATE INDEX idx_schedule_sessions_player ON schedule_sessions(player_id);
CREATE INDEX idx_schedule_sessions_type ON schedule_sessions(session_type);

-- Link a confirmed private session request back to its created session
ALTER TABLE private_session_requests
  ADD COLUMN schedule_session_id UUID REFERENCES schedule_sessions(id) ON DELETE SET NULL;

-- Attendance: support rows whose schedule_session has no group_id (private sessions).
-- group_id is already nullable; just make the RPC treat NULL group_id correctly.
DROP INDEX IF EXISTS idx_attendance_unique_session;
CREATE UNIQUE INDEX idx_attendance_unique_session
  ON attendance(player_id, COALESCE(group_id, '00000000-0000-0000-0000-000000000000'::uuid), session_date, schedule_session_id);

CREATE OR REPLACE FUNCTION log_attendance_with_deduction(
  p_player_id UUID,
  p_group_id UUID,
  p_session_date DATE,
  p_session_time TIME,
  p_status TEXT,
  p_marked_by UUID,
  p_schedule_session_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_subscription_id UUID DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_attendance_id UUID;
  v_remaining INTEGER;
  v_existing UUID;
  v_sub_id UUID;
  v_sub_total INTEGER;
BEGIN
  -- Match existing row (NULL-safe on group_id for private sessions)
  SELECT id INTO v_existing
  FROM attendance
  WHERE player_id = p_player_id
    AND group_id IS NOT DISTINCT FROM p_group_id
    AND session_date = p_session_date
    AND schedule_session_id = p_schedule_session_id;

  IF v_existing IS NOT NULL THEN
    UPDATE attendance
    SET status = p_status::text,
        notes = p_notes,
        marked_by = p_marked_by
    WHERE id = v_existing
    RETURNING id INTO v_attendance_id;

    IF p_status = 'present' THEN
      SELECT sessions_remaining INTO v_remaining
      FROM subscriptions
      WHERE player_id = p_player_id AND status = 'active'
      ORDER BY created_at DESC LIMIT 1;

      RETURN json_build_object(
        'attendance_id', v_attendance_id,
        'sessions_remaining', v_remaining,
        'updated', true
      );
    END IF;

    RETURN json_build_object('attendance_id', v_attendance_id, 'sessions_remaining', NULL, 'updated', true);
  END IF;

  INSERT INTO attendance (player_id, group_id, session_date, session_time, status, marked_by, schedule_session_id, notes)
  VALUES (p_player_id, p_group_id, p_session_date, p_session_time, p_status, p_marked_by, p_schedule_session_id, p_notes)
  RETURNING id INTO v_attendance_id;

  IF p_status = 'present' THEN
    IF p_subscription_id IS NOT NULL THEN
      v_sub_id := p_subscription_id;
      PERFORM 1 FROM subscriptions
      WHERE id = v_sub_id
        AND player_id = p_player_id
        AND status = 'active'
        AND sessions_remaining > 0;
      IF NOT FOUND THEN
        v_sub_id := NULL;
      END IF;
    ELSE
      SELECT id INTO v_sub_id
      FROM subscriptions
      WHERE player_id = p_player_id
        AND status = 'active'
        AND sessions_remaining > 0
      ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_sub_id IS NOT NULL THEN
      UPDATE subscriptions
      SET sessions_remaining = CASE
            WHEN sessions_total = 1 THEN 0
            ELSE sessions_remaining - 1
          END,
          status = CASE
            WHEN sessions_total = 1 THEN 'expired'::subscription_status
            ELSE status
          END,
          updated_at = NOW()
      WHERE id = v_sub_id
      RETURNING sessions_remaining, sessions_total INTO v_remaining, v_sub_total;
    ELSE
      v_remaining := 0;
    END IF;

    RETURN json_build_object(
      'attendance_id', v_attendance_id,
      'sessions_remaining', COALESCE(v_remaining, 0),
      'updated', false
    );
  END IF;

  RETURN json_build_object('attendance_id', v_attendance_id, 'sessions_remaining', NULL, 'updated', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
