-- ═══════════════════════════════════════════════════════════════
-- Players stop writing their own subscriptions (2026-10-04)
--   "Players can create own subscriptions" and "Players can update own
--   subscriptions" checked only player_id, so a signed-in player could
--   give themselves an active subscription with any balance straight
--   through the API, or activate one an admin hadn't confirmed. Pending
--   subscriptions also count as balance at attendance.
--
--   Now only admins (their own policy) and the server (service role)
--   write subscriptions. Players subscribe through the subscribe action,
--   which writes with the service role; freezing already did.
--
--   Payments: a player still records their own payment, but only as
--   pending, for an admin to review.
--
--   NOT safe to apply ahead of the code. Apply it AFTER deploying the
--   feat/player-coaches code. Until then the live subscribe page inserts
--   subscriptions as the player, and subscribing would fail.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Players can create own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Players can update own subscriptions" ON subscriptions;

DROP POLICY IF EXISTS "Players can create own payments" ON payments;
CREATE POLICY "Players can create own pending payments"
  ON payments FOR INSERT
  WITH CHECK (auth.uid() = player_id AND status = 'pending');
