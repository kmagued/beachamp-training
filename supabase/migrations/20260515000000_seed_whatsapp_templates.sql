-- ═══════════════════════════════════════════════════════════════
-- Seed starter WhatsApp templates (2026-05-13)
--   Idempotent: each insert skips if a row with the same name exists.
--   sort_order is appended after any existing templates so reordering
--   from the admin UI is preserved.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  next_order INTEGER;
BEGIN
  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_order FROM whatsapp_templates;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Welcome', $body$Hi {{first_name}}, welcome to Beachamp Training! 🏐

We're glad to have you on board. Your profile is set up and you can sign in any time.

If you have any questions about your training package or schedule, just reply to this message.$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Welcome');
  IF FOUND THEN next_order := next_order + 1; END IF;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Renewal reminder', $body$Hi {{first_name}},

You have {{sessions_remaining}} sessions left in your {{package_name}} package, expiring on {{subscription_end_date}}.

Want to renew? Let me know and I'll set it up for you.$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Renewal reminder');
  IF FOUND THEN next_order := next_order + 1; END IF;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Low sessions warning', $body$Hi {{first_name}},

Just a heads up — you have only {{sessions_remaining}} sessions left in your current package.

Let me know if you'd like to renew before your next session.$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Low sessions warning');
  IF FOUND THEN next_order := next_order + 1; END IF;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Next session reminder', $body$Hi {{first_name}},

Reminder: your next session is on {{next_session_date}} at {{next_session_time}}.

See you on the court! 🏐$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Next session reminder');
  IF FOUND THEN next_order := next_order + 1; END IF;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Payment pending', $body$Hi {{first_name}},

We're still waiting to confirm your payment for the {{package_name}} package. Could you share the payment receipt or let us know if you've sent it?

Thanks!$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Payment pending');
  IF FOUND THEN next_order := next_order + 1; END IF;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Missed session check-in', $body$Hi {{first_name}},

We missed you at the last session. Hope everything's okay!

If you need to adjust your schedule or pause your subscription, just let me know.$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Missed session check-in');
  IF FOUND THEN next_order := next_order + 1; END IF;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Schedule change', $body$Hi {{first_name}},

Heads up — there's a change to the schedule that affects your group. Please check the app for the updated times.

Let me know if the new time doesn't work for you.$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Schedule change');
  IF FOUND THEN next_order := next_order + 1; END IF;

  INSERT INTO whatsapp_templates (name, body, sort_order)
  SELECT 'Welcome back', $body$Hi {{first_name}}, welcome back!

Your subscription is active again and you have {{sessions_remaining}} sessions ready to use. Looking forward to seeing you on the court!$body$, next_order
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE name = 'Welcome back');
END $$;
