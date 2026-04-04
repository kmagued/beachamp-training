-- Enable RLS on subscription_freezes table
ALTER TABLE subscription_freezes ENABLE ROW LEVEL SECURITY;

-- Players can view their own freeze history
CREATE POLICY "Players can view own freeze history"
  ON subscription_freezes FOR SELECT
  USING (
    subscription_id IN (
      SELECT id FROM subscriptions WHERE player_id = auth.uid()
    )
  );

-- Admins can manage all freeze records
CREATE POLICY "Admins can manage all freeze records"
  ON subscription_freezes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Players can update their own subscriptions (needed for freeze/unfreeze via regular client)
CREATE POLICY "Players can update own subscriptions"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = player_id)
  WITH CHECK (auth.uid() = player_id);
