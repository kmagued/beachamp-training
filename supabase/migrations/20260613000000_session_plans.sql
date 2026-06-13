-- ═══════════════════════════════════════════
-- Session Plans — per-date training plan
-- (goal + free-text workouts) for a schedule session.
-- Coaches and admins only; mirrors the attendance pattern.
-- ═══════════════════════════════════════════

CREATE TABLE session_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  session_date        DATE NOT NULL,
  goal                TEXT,
  description         TEXT,
  updated_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One plan per session occurrence; also the upsert conflict target.
CREATE UNIQUE INDEX idx_session_plans_unique
  ON session_plans(schedule_session_id, session_date);

ALTER TABLE session_plans ENABLE ROW LEVEL SECURITY;

-- Coaches and admins can read and write. No player policy: players never see plans.
CREATE POLICY "Coaches and admins can manage session plans"
  ON session_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('coach', 'admin')
    )
  );
