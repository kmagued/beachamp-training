-- Allow admin to specify which subscription to deduct from during attendance.
-- When p_subscription_id is provided, deduct from that specific subscription.
-- When NULL, fall back to existing auto-selection (most recent active).

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
BEGIN
  -- Check for duplicate
  SELECT id INTO v_existing
  FROM attendance
  WHERE player_id = p_player_id
    AND group_id = p_group_id
    AND session_date = p_session_date
    AND schedule_session_id = p_schedule_session_id;

  IF v_existing IS NOT NULL THEN
    -- Update existing record
    UPDATE attendance
    SET status = p_status::text,
        notes = p_notes,
        marked_by = p_marked_by
    WHERE id = v_existing
    RETURNING id INTO v_attendance_id;

    -- Handle status changes for deductions (only deduct if changing TO present)
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

  -- Insert new attendance record
  INSERT INTO attendance (player_id, group_id, session_date, session_time, status, marked_by, schedule_session_id, notes)
  VALUES (p_player_id, p_group_id, p_session_date, p_session_time, p_status, p_marked_by, p_schedule_session_id, p_notes)
  RETURNING id INTO v_attendance_id;

  -- If present, deduct session
  IF p_status = 'present' THEN
    IF p_subscription_id IS NOT NULL THEN
      -- Use the specified subscription
      v_sub_id := p_subscription_id;
      -- Verify it belongs to the player and is active with remaining sessions
      PERFORM 1 FROM subscriptions
      WHERE id = v_sub_id
        AND player_id = p_player_id
        AND status = 'active'
        AND sessions_remaining > 0;
      IF NOT FOUND THEN
        v_sub_id := NULL;
      END IF;
    ELSE
      -- Fall back to most recent active subscription
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
          updated_at = NOW()
      WHERE id = v_sub_id
      RETURNING sessions_remaining INTO v_remaining;
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
