-- ═══════════════════════════════════════════════════════════════
-- Birthday WhatsApp template (2026-10-04)
--   A template can be marked with a purpose. Clicking a name under
--   "Birthdays to celebrate" opens the WhatsApp drawer with the template
--   marked 'birthday' already filled in. Seeds an editable "Birthday
--   wishes" template with that purpose, once.
--
--   Safe to apply ahead of the code: a new nullable column and one more
--   template, which shows in the template list like any other.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE whatsapp_templates ADD COLUMN purpose TEXT;

-- One template per purpose
CREATE UNIQUE INDEX idx_whatsapp_templates_purpose
  ON whatsapp_templates(purpose) WHERE purpose IS NOT NULL;

INSERT INTO whatsapp_templates (name, body, purpose, sort_order)
SELECT
  'Birthday wishes',
  'Happy birthday {{first_name}}! 🎂🎉 Wishing you an amazing year ahead, on and off the court. See you at training! — Beachamp Academy',
  'birthday',
  COALESCE((SELECT MAX(sort_order) + 1 FROM whatsapp_templates), 0)
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_templates WHERE purpose = 'birthday');
