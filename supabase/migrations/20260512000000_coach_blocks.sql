-- ═══════════════════════════════════════════════════════════════
-- Coach Schedule Blocking (2026-05-11)
--   coach_blocks — one_time and weekly unavailability per coach
-- ═══════════════════════════════════════════════════════════════

CREATE TYPE block_kind AS ENUM ('one_time', 'weekly');

CREATE TABLE coach_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind            block_kind NOT NULL,

  -- One-time fields
  start_date      DATE,
  end_date        DATE,

  -- Weekly fields
  day_of_week     INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  effective_from  DATE,
  effective_until DATE,

  -- Common: NULL for one-time = all-day; always set for weekly
  start_time      TIME,
  end_time        TIME,

  reason          TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_time_shape CHECK (
    (kind = 'one_time' AND start_date IS NOT NULL AND day_of_week IS NULL) OR
    (kind = 'weekly'   AND day_of_week IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL)
  ),
  CONSTRAINT one_time_dates CHECK (
    kind <> 'one_time' OR (end_date IS NULL OR end_date >= start_date)
  ),
  CONSTRAINT times_symmetric CHECK (
    (start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX idx_coach_blocks_coach_date ON coach_blocks(coach_id, start_date);
CREATE INDEX idx_coach_blocks_coach_dow  ON coach_blocks(coach_id, day_of_week);

CREATE TRIGGER coach_blocks_updated_at
  BEFORE UPDATE ON coach_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE coach_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach manages own blocks"
  ON coach_blocks FOR ALL
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "admins manage all blocks"
  ON coach_blocks FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON coach_blocks TO authenticated;
