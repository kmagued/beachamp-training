-- ============================================
-- 1. Fix "Subscription Expiring Soon" trigger so it never fires when
--    sessions_remaining has reached zero. The exhausted state has its
--    own notification (added below).
-- ============================================
CREATE OR REPLACE FUNCTION notify_subscription_expiring()
RETURNS TRIGGER AS $$
DECLARE
  v_days_left INTEGER;
  v_ratio NUMERIC;
  v_already_notified BOOLEAN;
BEGIN
  -- Only for active multi-session subscriptions with sessions left
  IF NEW.status != 'active' OR NEW.sessions_total <= 1 OR NEW.sessions_remaining <= 0 THEN
    RETURN NEW;
  END IF;

  v_ratio := NEW.sessions_remaining::NUMERIC / GREATEST(NEW.sessions_total, 1);

  IF NEW.end_date IS NOT NULL THEN
    v_days_left := (NEW.end_date - CURRENT_DATE);
  ELSE
    v_days_left := NULL;
  END IF;

  IF (v_ratio <= 0.3 AND v_ratio > 0) OR (v_days_left IS NOT NULL AND v_days_left <= 10 AND v_days_left > 0) THEN
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

-- ============================================
-- 2. Notify when a multi-session subscription runs out of sessions
--    (sessions_remaining transitions from > 0 to 0).
-- ============================================
CREATE OR REPLACE FUNCTION notify_subscription_exhausted()
RETURNS TRIGGER AS $$
DECLARE
  v_player_name TEXT;
BEGIN
  IF NEW.status = 'active'
     AND NEW.sessions_total > 1
     AND OLD.sessions_remaining > 0
     AND NEW.sessions_remaining <= 0 THEN

    INSERT INTO notifications (user_id, title, body, type, link)
    VALUES (
      NEW.player_id,
      'No Sessions Remaining',
      'You have used all sessions in your current package. Renew to keep training.',
      'subscription',
      '/player/subscribe'
    );

    SELECT first_name || ' ' || last_name INTO v_player_name FROM profiles WHERE id = NEW.player_id;
    INSERT INTO notifications (user_id, title, body, type, link)
    SELECT
      p.id,
      'Player Out of Sessions',
      COALESCE(v_player_name, 'A player') || ' has used all sessions in their current package.',
      'subscription',
      '/admin/players/' || NEW.player_id
    FROM profiles p WHERE p.role = 'admin' AND p.is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_subscription_exhausted ON subscriptions;
CREATE TRIGGER trg_subscription_exhausted
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  WHEN (OLD.sessions_remaining IS DISTINCT FROM NEW.sessions_remaining)
  EXECUTE FUNCTION notify_subscription_exhausted();

-- ============================================
-- 3. Email every notification insert via the /api/notifications/email
--    webhook, so DB-trigger-generated notifications are emailed too.
--
--    One-time setup per environment:
--      ALTER DATABASE postgres SET app.webhook_url = 'https://YOUR_DOMAIN/api/notifications/email';
--      ALTER DATABASE postgres SET app.webhook_secret = 'YOUR_WEBHOOK_SECRET';
--    Without these settings the trigger silently no-ops.
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_notification_email()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
BEGIN
  v_url := current_setting('app.webhook_url', true);
  v_secret := current_setting('app.webhook_secret', true);

  IF v_url IS NULL OR v_url = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notification_email ON notifications;
CREATE TRIGGER trg_notification_email
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notification_email();
