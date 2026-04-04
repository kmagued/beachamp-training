-- Private session requests: player requests a private session, admin confirms/rejects
CREATE TABLE private_session_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  requested_date DATE NOT NULL,
  requested_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  location TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),
  admin_notes TEXT DEFAULT NULL,
  confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Updated_at trigger
CREATE TRIGGER set_updated_at_private_session_requests
  BEFORE UPDATE ON private_session_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE private_session_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can view own requests"
  ON private_session_requests FOR SELECT
  USING (auth.uid() = player_id);

CREATE POLICY "Players can create own requests"
  ON private_session_requests FOR INSERT
  WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Players can cancel own pending requests"
  ON private_session_requests FOR UPDATE
  USING (auth.uid() = player_id AND status = 'pending')
  WITH CHECK (auth.uid() = player_id AND status = 'cancelled');

CREATE POLICY "Admins can manage all requests"
  ON private_session_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Coaches can view requests assigned to them
CREATE POLICY "Coaches can view assigned requests"
  ON private_session_requests FOR SELECT
  USING (auth.uid() = coach_id);

-- Index for common queries
CREATE INDEX idx_private_session_requests_player ON private_session_requests(player_id);
CREATE INDEX idx_private_session_requests_status ON private_session_requests(status);
CREATE INDEX idx_private_session_requests_date ON private_session_requests(requested_date);
