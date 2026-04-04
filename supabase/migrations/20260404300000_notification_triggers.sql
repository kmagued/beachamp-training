-- ============================================
-- 1. Welcome message on registration
-- ============================================
CREATE OR REPLACE FUNCTION notify_welcome_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for players
  IF NEW.role = 'player' THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (
      NEW.id,
      'Welcome to Beachamp!',
      'Your account has been created. Complete your profile and subscribe to a training package to get started.',
      'system',
      '/player/subscribe'
    );

    -- Notify admins about new registration
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT
      p.id,
      'New Player Registered',
      NEW.first_name || ' ' || NEW.last_name || ' just registered. Remember to add them to a group and WhatsApp.',
      'system',
      '/admin/players'
    FROM profiles p WHERE p.role = 'admin' AND p.is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_welcome_message
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION notify_welcome_message();

-- ============================================
-- 2. Subscription expired
-- ============================================
CREATE OR REPLACE FUNCTION notify_subscription_expired()
RETURNS TRIGGER AS $$
DECLARE
  v_player_name TEXT;
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'expired' THEN
    -- Only notify for multi-session packages (not single sessions)
    IF NEW.sessions_total > 1 THEN
      -- Notify player
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (
        NEW.player_id,
        'Subscription Expired',
        'Your training package has expired. Renew to continue attending sessions.',
        'subscription',
        '/player/subscribe'
      );

      -- Notify admins
      SELECT first_name || ' ' || last_name INTO v_player_name FROM profiles WHERE id = NEW.player_id;
      INSERT INTO notifications (user_id, title, body, type, link)
      SELECT
        p.id,
        'Player Subscription Expired',
        COALESCE(v_player_name, 'A player') || '''s subscription has expired.',
        'subscription',
        '/admin/players/' || NEW.player_id
      FROM profiles p WHERE p.role = 'admin' AND p.is_active = TRUE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_subscription_expired
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_subscription_expired();

-- ============================================
-- 3. Subscription expiring soon (sessions low or days low)
--    Triggered when sessions_remaining drops
-- ============================================
CREATE OR REPLACE FUNCTION notify_subscription_expiring()
RETURNS TRIGGER AS $$
DECLARE
  v_days_left INTEGER;
  v_ratio NUMERIC;
  v_already_notified BOOLEAN;
BEGIN
  -- Only for active multi-session subscriptions
  IF NEW.status != 'active' OR NEW.sessions_total <= 1 THEN
    RETURN NEW;
  END IF;

  -- Calculate ratio and days left
  v_ratio := NEW.sessions_remaining::NUMERIC / GREATEST(NEW.sessions_total, 1);

  IF NEW.end_date IS NOT NULL THEN
    v_days_left := (NEW.end_date - CURRENT_DATE);
  ELSE
    v_days_left := NULL;
  END IF;

  -- Check if expiring soon: <=30% sessions or <=10 days
  IF (v_ratio <= 0.3 AND v_ratio > 0) OR (v_days_left IS NOT NULL AND v_days_left <= 10 AND v_days_left > 0) THEN
    -- Don't spam: check if we already sent this notification in the last 7 days
    SELECT EXISTS (
      SELECT 1 FROM notifications
      WHERE user_id = NEW.player_id
        AND type = 'reminder'
        AND title = 'Subscription Expiring Soon'
        AND created_at > NOW() - INTERVAL '7 days'
    ) INTO v_already_notified;

    IF NOT v_already_notified THEN
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (
        NEW.player_id,
        'Subscription Expiring Soon',
        CASE
          WHEN v_days_left IS NOT NULL AND v_days_left <= 10
            THEN 'Your subscription expires in ' || v_days_left || ' days. ' || NEW.sessions_remaining || ' sessions remaining.'
          ELSE 'You have ' || NEW.sessions_remaining || ' sessions remaining out of ' || NEW.sessions_total || '. Consider renewing.'
        END,
        'reminder',
        '/player/subscribe'
      );

      -- Also notify admins
      INSERT INTO notifications (user_id, title, body, type, link)
      SELECT
        p.id,
        'Player Subscription Expiring',
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.player_id) ||
          '''s subscription is expiring. ' || NEW.sessions_remaining || '/' || NEW.sessions_total || ' sessions left.',
        'reminder',
        '/admin/players/' || NEW.player_id
      FROM profiles p WHERE p.role = 'admin' AND p.is_active = TRUE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_subscription_expiring
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  WHEN (OLD.sessions_remaining IS DISTINCT FROM NEW.sessions_remaining OR OLD.end_date IS DISTINCT FROM NEW.end_date)
  EXECUTE FUNCTION notify_subscription_expiring();

-- ============================================
-- 4. Pending payment reminder (1 day after creation)
--    Triggered when payment stays pending — uses a check on created_at
--    Since we can't schedule, this fires on any payment update.
--    Instead, we trigger when subscription is still pending after insert.
-- ============================================
CREATE OR REPLACE FUNCTION notify_pending_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_already_notified BOOLEAN;
BEGIN
  -- Only for pending payments
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- Only if created more than 1 day ago
  IF NEW.created_at > NOW() - INTERVAL '1 day' THEN
    RETURN NEW;
  END IF;

  -- Don't spam
  SELECT EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = NEW.player_id
      AND type = 'payment'
      AND title = 'Payment Pending'
      AND created_at > NOW() - INTERVAL '3 days'
  ) INTO v_already_notified;

  IF NOT v_already_notified AND NEW.player_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (
      NEW.player_id,
      'Payment Pending',
      'Your payment is still pending confirmation. If you have already paid, please contact support.',
      'payment',
      '/player/subscriptions'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- This trigger fires on any update to payments (e.g., admin viewing them)
-- The function itself checks the timing condition
CREATE TRIGGER trg_pending_payment_reminder
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_pending_payment();

-- ============================================
-- 5. Membership frozen/unfrozen notifications
-- ============================================
CREATE OR REPLACE FUNCTION notify_subscription_freeze_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'frozen' AND NEW.status = 'frozen' THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (
      NEW.player_id,
      'Subscription Frozen',
      'Your subscription has been frozen. Your remaining days will be preserved until you unfreeze.',
      'subscription',
      '/player/subscriptions'
    );
  ELSIF OLD.status = 'frozen' AND NEW.status = 'active' THEN
    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (
      NEW.player_id,
      'Subscription Unfrozen',
      'Your subscription has been reactivated. You can now book and attend sessions.',
      'subscription',
      '/player/subscriptions'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_subscription_freeze_change
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND (NEW.status = 'frozen' OR OLD.status = 'frozen'))
  EXECUTE FUNCTION notify_subscription_freeze_change();
