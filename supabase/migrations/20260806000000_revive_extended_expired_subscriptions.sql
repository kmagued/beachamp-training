-- Repair subscriptions whose expiry date was extended while the row was still
-- stored as 'expired'.
--
-- updateSubscriptionEndDate (shipped 2026-07-26) wrote only end_date, on the
-- assumption that "expired" is derived from end_date at read time. It isn't:
-- lapsed subscriptions are flipped to status='expired' in the database, and
-- every consumer — daily report, player detail, group rosters, coach
-- attendance — selects on `status IN ('active','pending')`. An extension
-- therefore moved the date but left the subscription filtered out everywhere,
-- so attendance saw no balance and raised a pending payment for a player who
-- had paid sessions left.
--
-- Reported for Mohamed Abd el naeem (subscription 85c1763b-e397-4c88-913e-
-- aadc2a748045, 13 Jul – 13 Sep 2026, 2/8 sessions left), the only row in the
-- current database matching this shape.
--
-- Condition-scoped rather than keyed to that id, so it also repairs any other
-- subscription already extended past today with sessions still on it. Rows
-- whose balance is exhausted are deliberately left expired: more time does not
-- grant more sessions. A no-op on a database with no such rows.
--
-- Cairo's calendar day, not the server's — Postgres runs UTC, which rolls the
-- date over 2–3 hours before Cairo does.
--
-- Only `status` changes here, so no notification trigger fires:
--   trg_subscription_expired      needs OLD.status = 'active'
--   trg_subscription_expiring     WHEN sessions_remaining/end_date change
--   trg_subscription_exhausted    WHEN sessions_remaining changes
--   trg_subscription_freeze_change  needs 'frozen' on one side
UPDATE subscriptions
SET status = 'active'
WHERE status = 'expired'
  AND sessions_total > 1
  AND sessions_remaining > 0
  AND end_date >= (NOW() AT TIME ZONE 'Africa/Cairo')::date;
