-- ═══════════════════════════════════════════════════════════════
-- Paying for a private session (2026-10-04)
--   A player pays for a confirmed private session from their dashboard,
--   through the subscribe flow. The subscription that payment creates is
--   linked to the session (private_session_id). A session has at most one
--   live payment. Rejecting a payment cancels its subscription, so the
--   session can then be paid again.
--
--   Attendance: on a private session only its player_id (the player who
--   booked, or the first player an admin added) is charged, from their
--   payment for the session first. The other players aren't charged.
--
--   Safe to apply ahead of the code: the column, index and guard go unused
--   until the code ships. The attendance rule takes effect at once: other
--   players on a private session stop being charged. That is the agreed
--   rule, and it's how team sessions have been charged in practice.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. The private session a subscription pays for ─────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS private_session_id UUID
  REFERENCES schedule_sessions(id) ON DELETE SET NULL;

-- One live payment per session. Rejecting a payment cancels its subscription,
-- so the session can then be paid again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_private_session_live
  ON subscriptions(private_session_id)
  WHERE private_session_id IS NOT NULL AND status <> 'cancelled';

-- ── 2. Only an admin or the server writes the link ──────────────────────────
-- Players can insert and update their own subscriptions under RLS; without this
-- a player could link a subscription to someone else's session and block their
-- payment.
CREATE OR REPLACE FUNCTION guard_subscription_private_session()
RETURNS TRIGGER AS $$
DECLARE
  v_changed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.private_session_id IS NOT NULL;
  ELSE
    v_changed := NEW.private_session_id IS DISTINCT FROM OLD.private_session_id;
  END IF;
  -- A signed-in user who isn't an admin; the service role has no auth.uid()
  IF v_changed AND auth.uid() IS NOT NULL AND auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin or the server links a subscription to a private session'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS subscriptions_guard_private_session ON subscriptions;
CREATE TRIGGER subscriptions_guard_private_session
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION guard_subscription_private_session();

-- ── 3. Attendance on a private session charges only its payer ───────────────
-- Same entry point and signature as 20260905000000; the changes are marked.
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
  v_preferred UUID := p_subscription_id;
BEGIN
  -- New: on a private session only the payer (its player_id) is charged, and the
  -- payer's payment for this session is used unless the screen chose another
  SELECT session_type = 'private', player_id INTO v_private, v_payer
  FROM schedule_sessions WHERE id = p_schedule_session_id;

  IF v_private AND v_payer IS NOT NULL THEN
    IF p_player_id <> v_payer THEN
      v_charged := false;
    ELSIF v_preferred IS NULL THEN
      SELECT id INTO v_preferred
      FROM subscriptions
      WHERE private_session_id = p_schedule_session_id
        AND player_id = p_player_id
        AND status <> 'cancelled'
      LIMIT 1;
    END IF;
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
        v_sub_id := pick_deductible_subscription(p_player_id, v_preferred);
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
      v_sub_id := pick_deductible_subscription(p_player_id, v_preferred);
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
