-- RPC to re-credit a session when attendance is removed
CREATE OR REPLACE FUNCTION increment_sessions_remaining(p_player_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE subscriptions
  SET sessions_remaining = sessions_remaining + 1, updated_at = NOW()
  WHERE player_id = p_player_id
    AND status = 'active'
    AND id = (
      SELECT id FROM subscriptions
      WHERE player_id = p_player_id AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
