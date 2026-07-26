-- ============================================
-- Keep "Subscription Expiring Soon" from firing on date-only updates.
--
-- trg_subscription_expiring fires when EITHER sessions_remaining OR end_date
-- changes. That second arm produces misleading notifications: admins can now
-- edit a subscription's expiry date by hand (goodwill extensions), and an
-- extension that pushes the date out would tell the player their subscription
-- is expiring. The same noise comes from unfreeze and payment-date corrections.
--
-- The days-left arm of the notification never depended on this trigger anyway —
-- time passing doesn't UPDATE the row, so it only ever fired incidentally when
-- attendance changed sessions_remaining. That path still works.
--
-- Body is otherwise identical to 20260416000000_notification_email_and_exhausted.
-- ============================================
CREATE OR REPLACE FUNCTION notify_subscription_expiring()
RETURNS TRIGGER AS $$
DECLARE
  v_days_left INTEGER;
  v_ratio NUMERIC;
  v_already_notified BOOLEAN;
BEGIN
  -- Date-only change (admin expiry edit, unfreeze, payment date fix): stay silent
  IF TG_OP = 'UPDATE' AND OLD.sessions_remaining IS NOT DISTINCT FROM NEW.sessions_remaining THEN
    RETURN NEW;
  END IF;

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
