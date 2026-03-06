-- Add 'pending_payment' status for subscriptions created after attendance (unpaid session)
-- 'pending' remains for player-initiated subscriptions awaiting admin confirmation
ALTER TYPE subscription_status ADD VALUE 'pending_payment';
