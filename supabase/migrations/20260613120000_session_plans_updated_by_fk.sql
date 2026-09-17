-- ═══════════════════════════════════════════
-- Session plans: FK ON DELETE hardening (from code review)
-- ═══════════════════════════════════════════

-- session_plans.updated_by is an audit column and was created with the default
-- ON DELETE behavior (RESTRICT). That blocks deleting a coach/admin who has
-- authored any session plan (the deleteCoach flow nulls out audit refs and
-- relies on them not being RESTRICT). SET NULL is the correct behavior.
ALTER TABLE session_plans
  DROP CONSTRAINT IF EXISTS session_plans_updated_by_fkey,
  ADD CONSTRAINT session_plans_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
