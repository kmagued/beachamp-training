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

  // When promoting to 'coach', also set is_coach = true.
  // When demoting from 'coach' to 'player', clear is_coach.
  // When changing to/from 'admin', leave is_coach alone — admins can opt in separately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { role: newRole, updated_at: new Date().toISOString() };
  if (newRole === "coach") update.is_coach = true;
  if (newRole === "player") update.is_coach = false;

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) return { error: error.message };

  return { success: true };
}

export async function updateUserIsCoach(userId: string, isCoach: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") return { error: "Not authorized" };

  const { error } = await supabase
    .from("profiles")
    .update({ is_coach: isCoach, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: error.message };

  return { success: true };
}
