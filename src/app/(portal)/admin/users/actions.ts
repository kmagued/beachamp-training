"use server";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export async function updateUserRole(userId: string, newRole: UserRole) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify caller is admin
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") return { error: "Not authorized" };

  // Prevent self-demotion
  if (userId === user.id) return { error: "Cannot change your own role" };

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: error.message };

  return { success: true };
}
