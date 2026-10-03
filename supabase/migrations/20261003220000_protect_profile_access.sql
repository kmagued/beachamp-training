-- ═══════════════════════════════════════════════════════════════
-- Protect role, coach access and active status (2026-10-03)
--   "Users can update own profile" lets a signed-in user update every
--   column of their own row through the API, including role (making
--   themselves an admin), is_coach (coach access) and is_active
--   (reopening an account an admin deactivated). Now only an admin or
--   the server (service role, no signed-in user) can change those
--   three; players still edit the rest of their profile.
--
--   Safe to apply ahead of the code: the app changes these columns only
--   from admin pages (an admin's session) and server actions (service
--   role), and both still pass.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION guard_profile_access_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.is_coach IS DISTINCT FROM OLD.is_coach
      OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     -- A signed-in user who isn't an admin; the service role has no auth.uid()
     AND auth.uid() IS NOT NULL
     AND auth_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can change role, coach access or active status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS profiles_guard_access_columns ON profiles;
CREATE TRIGGER profiles_guard_access_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_access_columns();
