-- ══════════════════════════════════════════════════════
-- PHASE 2A: Training Groups & Session Management
-- Coach groups, schedule sessions, attendance enhancement
-- ══════════════════════════════════════════════════════

-- ══════════════════════════════════════
-- 1. COACH GROUPS (coach ↔ group assignments)
-- ══════════════════════════════════════
CREATE TABLE coach_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(coach_id, group_id)
);

CREATE INDEX idx_coach_groups_coach ON coach_groups(coach_id);
CREATE INDEX idx_coach_groups_group ON coach_groups(group_id);

ALTER TABLE coach_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their own assignments"
  ON coach_groups FOR SELECT
  USING (auth.uid() = coach_id);

CREATE POLICY "Admins can manage all coach assignments"
  ON coach_groups FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "All authenticated users can view coach assignments"
  ON coach_groups FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ══════════════════════════════════════
-- 2. SCHEDULE SESSIONS (recurring weekly schedule)
-- ══════════════════════════════════════
CREATE TABLE schedule_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  coach_id    UUID REFERENCES profiles(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday, 6=Saturday
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  location    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

CREATE INDEX idx_schedule_group ON schedule_sessions(group_id);
CREATE INDEX idx_schedule_coach ON schedule_sessions(coach_id);
CREATE INDEX idx_schedule_day ON schedule_sessions(day_of_week);

ALTER TABLE schedule_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view schedule"
  ON schedule_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage schedule"
  ON schedule_sessions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER schedule_sessions_updated_at
  BEFORE UPDATE ON schedule_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ══════════════════════════════════════
-- 3. ALTER ATTENDANCE — add schedule_session_id
-- ══════════════════════════════════════
ALTER TABLE attendance ADD COLUMN schedule_session_id UUID REFERENCES schedule_sessions(id);
CREATE INDEX idx_attendance_schedule ON attendance(schedule_session_id);

-- Drop the old unique index and create a new one that includes schedule_session_id
DROP INDEX IF EXISTS idx_attendance_unique_session;
CREATE UNIQUE INDEX idx_attendance_unique_session
  ON attendance(player_id, group_id, session_date, schedule_session_id);


-- ══════════════════════════════════════
-- 4. COACHES VIEW (helper for querying coaches)
-- ══════════════════════════════════════
CREATE OR REPLACE VIEW coaches_view AS
SELECT
  p.id,
  p.first_name,
  p.last_name,
  p.phone,
  p.email,
  p.avatar_url,
  p.is_active,
  p.created_at,
  (SELECT COUNT(*) FROM coach_groups cg WHERE cg.coach_id = p.id AND cg.is_active = TRUE) as group_count
FROM profiles p
WHERE p.role IN ('coach', 'admin');


-- ══════════════════════════════════════
-- 5. ATTENDANCE WITH DEDUCTION FUNCTION
-- ══════════════════════════════════════
CREATE OR REPLACE FUNCTION log_attendance_with_deduction(
  p_player_id UUID,
  p_group_id UUID,
  p_session_date DATE,
  p_session_time TIME,
  p_status TEXT,
  p_marked_by UUID,
  p_schedule_session_id UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_attendance_id UUID;
  v_remaining INTEGER;
  v_existing UUID;
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
      -- Check if we already deducted (look at original status before this update)
      -- We'll skip re-deduction since this is an update
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

  -- If present, deduct session from active subscription
  IF p_status = 'present' THEN
    UPDATE subscriptions
    SET sessions_remaining = sessions_remaining - 1, updated_at = NOW()
    WHERE player_id = p_player_id
      AND status = 'active'
      AND sessions_remaining > 0
    RETURNING sessions_remaining INTO v_remaining;

    RETURN json_build_object(
      'attendance_id', v_attendance_id,
      'sessions_remaining', COALESCE(v_remaining, 0),
      'updated', false
    );
  END IF;

  RETURN json_build_object('attendance_id', v_attendance_id, 'sessions_remaining', NULL, 'updated', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
