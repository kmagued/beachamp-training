-- Repair coach accounts that were created via the admin "Add Coach" flow but
-- ended up with NO profiles row. createCoach() created the auth user with
-- user_metadata.role = 'coach' and relied on the signup trigger to insert the
-- profile, but for these accounts the profile never persisted — so the coach
-- never appeared in the coaches list (filtered on is_coach), and logging in
-- with no profile defaulted them to the player portal (a blank /player/dashboard).
--
-- createCoach() now writes the profile explicitly; this backfills the existing
-- orphaned coach auth users. Safe and idempotent: it only inserts a profile for
-- auth users whose user_metadata says 'coach' and who currently have none.
INSERT INTO public.profiles (id, first_name, last_name, email, phone, role, is_coach, is_active, profile_completed)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'first_name', ''),
  COALESCE(u.raw_user_meta_data->>'last_name', ''),
  u.email,
  COALESCE(u.raw_user_meta_data->>'phone', u.phone),
  'coach',
  TRUE,
  TRUE,
  TRUE
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.raw_user_meta_data->>'role' = 'coach'
ON CONFLICT (id) DO NOTHING;
