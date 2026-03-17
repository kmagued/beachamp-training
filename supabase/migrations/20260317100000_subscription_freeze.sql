-- Add frozen status to subscriptions
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending', 'pending_payment', 'active', 'expired', 'cancelled', 'frozen'));

-- Freeze tracking fields
ALTER TABLE subscriptions
  ADD COLUMN frozen_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN frozen_days_remaining INTEGER DEFAULT NULL;

-- Freeze history table for audit
CREATE TABLE subscription_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unfrozen_at TIMESTAMPTZ DEFAULT NULL,
  days_frozen INTEGER DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
