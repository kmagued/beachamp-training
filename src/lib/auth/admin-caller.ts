import { createClient } from "@/lib/supabase/server";

/**
 * Whether the signed-in caller is an admin. A server action is a POST endpoint any signed-in
 * user can call (middleware only guards the pages), so an admin-only action that writes or
 * reads with the service role checks this itself.
 */
export async function isAdminCaller(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}
