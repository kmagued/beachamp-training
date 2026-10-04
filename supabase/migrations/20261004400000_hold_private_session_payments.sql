-- ═══════════════════════════════════════════════════════════════
-- A private session's payment is held for that session (2026-10-04)
--   A player who paid ahead for Saturday's private session and trained in a
--   group on Tuesday had Saturday's payment used on Tuesday: attendance
--   took the newest usable subscription. A payment linked to a private
--   session that is still on the schedule is now used only for that
--   session. Once the session is deleted, the payment is an ordinary
--   single session again.
--
--   Safe to apply ahead of the code: log_attendance_with_deduction keeps
--   its signature, and the new picker is only called by it.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Which subscription pays for this player at this session ─────────────
-- Usable: active or pending with a session left, and not a payment held for
-- another private session that's still on the schedule.
CREATE OR REPLACE FUNCTION pick_session_subscription(
  p_player_id UUID,
  p_schedule_session_id UUID,
  p_subscription_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_sub_id UUID;
BEGIN
  -- The subscription the screen chose, when it's usable here
  IF p_subscription_id IS NOT NULL THEN
    SELECT s.id INTO v_sub_id
    FROM subscriptions s
    WHERE s.id = p_subscription_id
      AND s.player_id = p_player_id
      AND s.status IN ('active', 'pending')
      AND s.sessions_remaining > 0
      AND NOT EXISTS (
        SELECT 1 FROM schedule_sessions ss
        WHERE ss.id = s.private_session_id
          AND ss.id <> p_schedule_session_id
          AND ss.is_active
      );
    IF v_sub_id IS NOT NULL THEN RETURN v_sub_id; END IF;
  END IF;

  -- The player's payment for this session
  SELECT s.id INTO v_sub_id
  FROM subscriptions s
  WHERE s.private_session_id = p_schedule_session_id
    AND s.player_id = p_player_id
    AND s.status IN ('active', 'pending')
    AND s.sessions_remaining > 0
  LIMIT 1;
  IF v_sub_id IS NOT NULL THEN RETURN v_sub_id; END IF;

  -- Otherwise the newest usable subscription, paid balance first
  SELECT s.id INTO v_sub_id
  FROM subscriptions s
  WHERE s.player_id = p_player_id
    AND s.status IN ('active', 'pending')
    AND s.sessions_remaining > 0
    AND NOT EXISTS (
      SELECT 1 FROM schedule_sessions ss
      WHERE ss.id = s.private_session_id
        AND ss.id <> p_schedule_session_id
        AND ss.is_active
    )
  ORDER BY (s.status = 'active') DESC, s.created_at DESC
  LIMIT 1;

  RETURN v_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 2. Attendance uses it ───────────────────────────────────────────────────
-- Same entry point and signature as 20261004200000. The only change: the
-- subscription comes from pick_session_subscription, which also prefers the
-- payer's payment for this session.
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
  v_existing_id UUID;
  v_old_status TEXT;
  v_old_sub UUID;
  v_sub_id UUID;
  v_remaining INTEGER;
  v_deducted BOOLEAN := false;
  v_reason TEXT := 'no_change';
  v_private BOOLEAN;
  v_payer UUID;
  v_charged BOOLEAN := true;
BEGIN
  -- On a private session only the payer (its player_id) is charged
  SELECT session_type = 'private', player_id INTO v_private, v_payer
  FROM schedule_sessions WHERE id = p_schedule_session_id;

  IF v_private AND v_payer IS NOT NULL AND p_player_id <> v_payer THEN
    v_charged := false;
  END IF;

  -- Match existing row (NULL-safe on group_id for private sessions)
  SELECT id, status, subscription_id
  INTO v_existing_id, v_old_status, v_old_sub
  FROM attendance
  WHERE player_id = p_player_id
    AND group_id IS NOT DISTINCT FROM p_group_id
    AND session_date = p_session_date
    AND schedule_session_id = p_schedule_session_id;

  IF v_existing_id IS NOT NULL THEN
    v_attendance_id := v_existing_id;

    IF v_old_status = 'present' AND p_status <> 'present' THEN
      -- Correcting present -> absent/excused: return the session, unless none was
      -- taken (a player who isn't charged, with no subscription recorded)
      IF v_charged OR v_old_sub IS NOT NULL THEN
        PERFORM restore_session_credit(p_player_id, v_old_sub);
        v_reason := 'recredited';
      END IF;
      UPDATE attendance
      SET status = p_status, notes = p_notes, marked_by = p_marked_by, subscription_id = NULL
      WHERE id = v_existing_id;
      v_sub_id := NULL;

    ELSIF v_old_status <> 'present' AND p_status = 'present' THEN
      IF NOT v_charged THEN
        v_reason := 'not_charged';
        v_sub_id := NULL;
      ELSE
        -- Correcting absent/excused -> present: deduct now
        v_sub_id := pick_session_subscription(p_player_id, p_schedule_session_id, p_subscription_id);
        IF v_sub_id IS NOT NULL THEN
          v_remaining := apply_session_deduction(v_sub_id);
          v_deducted := true;
          v_reason := 'deducted';
        ELSE
          v_reason := 'no_subscription';
        END IF;
      END IF;
      UPDATE attendance
      SET status = p_status, notes = p_notes, marked_by = p_marked_by, subscription_id = v_sub_id
      WHERE id = v_existing_id;

    ELSE
      -- No status transition: re-saving the report must not double-deduct
      UPDATE attendance
      SET status = p_status, notes = p_notes, marked_by = p_marked_by
      WHERE id = v_existing_id;
      v_sub_id := v_old_sub;
      v_reason := CASE
        WHEN p_status <> 'present' THEN 'no_change'
        WHEN NOT v_charged AND v_old_sub IS NULL THEN 'not_charged'
        ELSE 'already_deducted'
      END;
    END IF;

    IF v_remaining IS NULL THEN
      SELECT sessions_remaining INTO v_remaining
      FROM subscriptions
      WHERE player_id = p_player_id
        AND status IN ('active', 'pending')
      ORDER BY (status = 'active') DESC, created_at DESC
      LIMIT 1;
    END IF;

    RETURN json_build_object(
      'attendance_id', v_attendance_id,
      'sessions_remaining', v_remaining,
      'updated', true,
      'deducted', v_deducted,
      'reason', v_reason,
      'subscription_id', v_sub_id
    );
  END IF;

  -- New attendance record. Resolve the subscription first so the row can record it.
  IF p_status = 'present' THEN
    IF NOT v_charged THEN
      v_reason := 'not_charged';
    ELSE
      v_sub_id := pick_session_subscription(p_player_id, p_schedule_session_id, p_subscription_id);
      IF v_sub_id IS NOT NULL THEN
        v_remaining := apply_session_deduction(v_sub_id);
        v_deducted := true;
        v_reason := 'deducted';
      ELSE
        v_reason := 'no_subscription';
      END IF;
    END IF;
  END IF;

  INSERT INTO attendance (
    player_id, group_id, session_date, session_time, status,
    marked_by, schedule_session_id, notes, subscription_id
  )
  VALUES (
    p_player_id, p_group_id, p_session_date, p_session_time, p_status,
    p_marked_by, p_schedule_session_id, p_notes, v_sub_id
  )
  RETURNING id INTO v_attendance_id;

  RETURN json_build_object(
    'attendance_id', v_attendance_id,
    -- NULL, not 0, when nothing was deducted: 0 previously read as a real balance
    'sessions_remaining', v_remaining,
    'updated', false,
    'deducted', v_deducted,
    'reason', v_reason,
    'subscription_id', v_sub_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
