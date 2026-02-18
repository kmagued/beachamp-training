import { createClient } from "@/lib/supabase/server";

/** Get current user + profile for use in layouts/server components */
export async function getCurrentUser() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const initials =
    `${(profile.first_name || "")[0] || ""}${(profile.last_name || "")[0] || ""}`.toUpperCase() ||
    "U";

  return {
    id: user.id,
    email: user.email || "",
    initials,
    profile,
  };
}
