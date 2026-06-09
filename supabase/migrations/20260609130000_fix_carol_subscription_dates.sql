-- One-off data repair for Carol Kamal (player 582729ca-7241-48ff-9e64-55e2bd2bf92d).
--
-- Her subscription start/end dates were set by the renewal-chaining logic
-- (computeRenewalStartDate), which ignores the real payment date, so the
-- subscription history showed the wrong period:
--   Monthly  paid 19 Apr 2026  ->  showed 04 Jun – 04 Jul   (should be 19 Apr – 19 May)
--   Single   paid 06 Jun 2026  ->  showed 05 Jul           (should be 06 Jun)
--
-- Academy decision (2026-06-09): re-date both to their real payment periods.
-- The Monthly's 30-day window (19 Apr – 19 May) has already passed, so it is
-- marked expired and its 2 unused sessions are forfeit (sessions_remaining left
-- at 2 to reflect what actually happened — 8 bought, 6 attended). The Single was
-- already consumed (expired, 0 remaining); only its start date is corrected.
--
-- Targeted by primary key, so this is a no-op on any database that doesn't
-- contain these exact rows (e.g. a fresh `db reset`).
--
-- The Monthly row is currently 'active', so flipping it to 'expired' would fire
-- trg_subscription_expired (AFTER UPDATE ON subscriptions) and push a spurious
-- "subscription expired" notification/email to Carol — months after the fact.
-- Suppress that one trigger for the duration of the repair, then re-enable it.
ALTER TABLE subscriptions DISABLE TRIGGER trg_subscription_expired;

UPDATE subscriptions
SET start_date = '2026-04-19',
    end_date   = '2026-05-19',
    status     = 'expired'
WHERE id = '9b56945c-278a-4bcb-a26b-67965fbdb286';

UPDATE subscriptions
SET start_date = '2026-06-06'
WHERE id = '290d25a4-3dee-4a78-b2ce-0cd72e34a678';

ALTER TABLE subscriptions ENABLE TRIGGER trg_subscription_expired;
