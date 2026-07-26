-- ═══════════════════════════════════════════════════════════════
-- Coaches can view player subscriptions (2026-06-20)
--   Bug: when a coach logs attendance, every player showed
--   "No active subscription" / "0 balance" because the attendance
--   UI (AttendanceTab) reads the `subscriptions` table with the
--   anon/browser client, which is RLS-gated. The only SELECT
--   policies on `subscriptions` were for the player themselves and
--   for admins — there was no coach policy, so a role='coach' user
--   got zero rows back.
--
--   This also caused spurious pending payments: the attendance UI
--   flags every "zero-balance" present player and creates a pending
--   payment for them, so coaches double-charged players who actually
--   had sessions remaining.
--
--   Admin-coaches (role='admin', is_coach=true) were unaffected —
--   they read subscriptions via the existing admin policy.
--
--   Fix mirrors the existing coach read policies on `profiles`
--   ("Coaches can view player profiles") and `group_players`
--   ("Coaches can view group players"), which are likewise broad
--   (any coach can read, not scoped to assigned groups).
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Coaches can view subscriptions" ON subscriptions;

CREATE POLICY "Coaches can view subscriptions"
  ON subscriptions FOR SELECT USING (auth_role() = 'coach');
