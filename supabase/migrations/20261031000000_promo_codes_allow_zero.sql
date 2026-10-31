-- ═══════════════════════════════════════════════════════════════
-- Promo codes can be 0% or 0 EGP (2026-10-31)
--   Admins hand out codes that track a referral or campaign without
--   taking anything off the price. A 0 discount charges the full price
--   and still records the use.
--
--   Safe to apply ahead of the code: it only widens the check.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_discount_value_check;

ALTER TABLE promo_codes
  ADD CONSTRAINT promo_codes_discount_value_check
  CHECK (discount_value >= 0);
