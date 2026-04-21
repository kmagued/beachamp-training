-- Allow private sessions to have multiple players via a join table.
-- The single-player `schedule_sessions.player_id` column becomes back-compat only;
-- readers should prefer `schedule_session_players` as the source of truth.

CREATE TABLE schedule_session_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_session_id UUID NOT NULL REFERENCES schedule_sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_session_id, player_id)
);

CREATE INDEX idx_schedule_session_players_session ON schedule_session_players(schedule_session_id);
CREATE INDEX idx_schedule_session_players_player ON schedule_session_players(player_id);

ALTER TABLE schedule_session_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view session players"
  ON schedule_session_players FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage session players"
  ON schedule_session_players FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Backfill from existing single-player private sessions
INSERT INTO schedule_session_players (schedule_session_id, player_id)
SELECT id, player_id
FROM schedule_sessions
WHERE session_type = 'private' AND player_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Relax the check constraint: a private session no longer requires player_id,
-- because players can now live entirely in the join table.
ALTER TABLE schedule_sessions DROP CONSTRAINT IF EXISTS schedule_sessions_kind_check;
ALTER TABLE schedule_sessions ADD CONSTRAINT schedule_sessions_kind_check CHECK (
  (session_type = 'group' AND group_id IS NOT NULL AND player_id IS NULL)
  OR
  (session_type = 'private' AND group_id IS NULL)
);
