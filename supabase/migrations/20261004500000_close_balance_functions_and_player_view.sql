-- ═══════════════════════════════════════════════════════════════
-- Players can't change balances or read other players (2026-10-04)
--   The attendance and balance functions are SECURITY DEFINER and were
--   callable by any signed-in user through the API: a player could give
--   themselves sessions back, take sessions from anyone, look up another
--   player's subscriptions or write attendance. Only the server (service
--   role) calls them; when they call each other they run as their owner.
--
--   players_with_status ran as its owner, so any signed-in user could read
--   every player's full profile (phone, date of birth, health conditions)
--   through it. It now runs with the reader's own permissions, and
--   signed-out visitors can't read it. Only admin pages read it, and admins
--   can read every profile.
--
--   Safe to apply ahead of the code: the app calls these functions only
--   with the service role, and only admin pages read the view.
-- ═══════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION pick_deductible_subscription(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION pick_session_subscription(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION apply_session_deduction(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION restore_session_credit(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_sessions_remaining(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_attendance_with_deduction(UUID, UUID, DATE, TIME, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION log_attendance_with_deduction(UUID, UUID, DATE, TIME, TEXT, UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION pick_deductible_subscription(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION pick_session_subscription(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION apply_session_deduction(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION restore_session_credit(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION increment_sessions_remaining(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION log_attendance_with_deduction(UUID, UUID, DATE, TIME, TEXT, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION log_attendance_with_deduction(UUID, UUID, DATE, TIME, TEXT, UUID, UUID, TEXT, UUID) TO service_role;

ALTER VIEW players_with_status SET (security_invoker = true);
REVOKE ALL ON players_with_status FROM anon;
