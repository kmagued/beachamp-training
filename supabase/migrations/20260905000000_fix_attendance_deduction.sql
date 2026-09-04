-- Root-cause fix for "attendance logged but subscription balance never decrements".
--
-- Three silent failure modes existed in log_attendance_with_deduction:
--
--   1. Deduction required status = 'active', but player-initiated subscriptions are
--      created as 'pending' until an admin confirms payment. The attendance screens
--      show pending subs as usable balance, so a coach would mark a player present
--      against a balance the function then refused to touch -- attendance was written,
--      the deduction was skipped, and nothing surfaced the discrepancy.
--   2. When an attendance row already existed, the function updated its status and
--      returned early. Correcting absent -> present therefore never deducted.
--   3. "No subscription found" returned sessions_remaining = 0, which the UI reported
--      as "player has 0 sessions remaining" -- indistinguishable from a real zero
--      balance, on a screen simultaneously showing 8/8.
--
-- The fix makes the deduction outcome explicit, records which subscription was
-- consumed, and handles status transitions in both directions.

-- ── 1. Record which subscription each attendance row consumed ────────────────
-- Without this, re-crediting a removed attendance had to guess at the subscription.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id);
CREATE INDEX IF NOT EXISTS idx_attendance_subscription ON attendance(subscription_id);

-- ── 2. Which subscription should a session be taken from? ────────────────────
-- 'pending' is now eligible: the attendance UI already presents it as available
-- balance, so refusing it here is what let attendance and balance drift apart.
-- Active subscriptions are still preferred so paid balance is consumed first.
CREATE OR REPLACE FUNCTION pick_deductible_subscription(
  p_player_id UUID,
  p_subscription_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_sub_id UUID;
BEGIN
  -- Honour an explicitly chosen subscription when it is still usable
  IF p_subscription_id IS NOT NULL THEN
    SELECT id INTO v_sub_id
    FROM subscriptions
    WHERE id = p_subscription_id
      AND player_id = p_player_id
      AND status IN ('active', 'pending')
      AND sessions_remaining > 0;
    IF v_sub_id IS NOT NULL THEN RETURN v_sub_id; END IF;
  END IF;

  -- Otherwise fall back to auto-selection rather than skipping the deduction
  SELECT id INTO v_sub_id
  FROM subscriptions
  WHERE player_id = p_player_id
    AND status IN ('active', 'pending')
    AND sessions_remaining > 0
  ORDER BY (status = 'active') DESC, created_at DESC
  LIMIT 1;

  RETURN v_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Consume one session ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_session_deduction(p_subscription_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  UPDATE subscriptions
  SET sessions_remaining = GREATEST(sessions_remaining - 1, 0),
      -- Single-session packages expire on use, but only once actually paid for;
      -- expiring a 'pending' sub here would corrupt the payment-confirmation flow.
      status = CASE
        WHEN sessions_total = 1 AND status = 'active' THEN 'expired'::subscription_status
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = p_subscription_id
  RETURNING sessions_remaining INTO v_remaining;

  RETURN v_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Give a session back ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION restore_session_credit(
  p_player_id UUID,
  p_subscription_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_sub_id UUID;
BEGIN
  v_sub_id := p_subscription_id;

  -- Attendance rows written before subscription_id existed don't know their source
  IF v_sub_id IS NULL THEN
    SELECT id INTO v_sub_id
    FROM subscriptions
    WHERE player_id = p_player_id
      AND (
        status IN ('active', 'pending')
        OR (status = 'expired' AND sessions_total = 1)
      )
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  IF v_sub_id IS NULL THEN RETURN; END IF;

  UPDATE subscriptions
  SET sessions_remaining = LEAST(sessions_remaining + 1, sessions_total),
      status = CASE
        WHEN status = 'expired' AND sessions_total = 1 THEN 'active'::subscription_status
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = v_sub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep the old entry point working for any caller still using it
CREATE OR REPLACE FUNCTION increment_sessions_remaining(p_player_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM restore_session_credit(p_player_id, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. The attendance entry point ────────────────────────────────────────────
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
BEGIN
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
      -- Correcting present -> absent/excused: return the session
      PERFORM restore_session_credit(p_player_id, v_old_sub);
      UPDATE attendance
      SET status = p_status, notes = p_notes, marked_by = p_marked_by, subscription_id = NULL
      WHERE id = v_existing_id;
      v_reason := 'recredited';
      v_sub_id := NULL;

    ELSIF v_old_status <> 'present' AND p_status = 'present' THEN
      -- Correcting absent/excused -> present: deduct now (previously skipped entirely)
      v_sub_id := pick_deductible_subscription(p_player_id, p_subscription_id);
      IF v_sub_id IS NOT NULL THEN
        v_remaining := apply_session_deduction(v_sub_id);
        v_deducted := true;
        v_reason := 'deducted';
      ELSE
        v_reason := 'no_subscription';
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
      v_reason := CASE WHEN p_status = 'present' THEN 'already_deducted' ELSE 'no_change' END;
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
    v_sub_id := pick_deductible_subscription(p_player_id, p_subscription_id);
    IF v_sub_id IS NOT NULL THEN
      v_remaining := apply_session_deduction(v_sub_id);
      v_deducted := true;
      v_reason := 'deducted';
    ELSE
      v_reason := 'no_subscription';
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
