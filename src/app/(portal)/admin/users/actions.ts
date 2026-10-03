"use server";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";
import { roleChangeFlags } from "@/lib/auth/role-change";

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

  const { data: target } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!target) return { error: "User not found" };

  // Coach access is on for coaches, off for players, untouched for admins. A player made an
  // admin keeps playing (is_player); a player or coach role clears the flag.
  const update = { role: newRole, ...roleChangeFlags(target.role, newRole), updated_at: new Date().toISOString() };

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

export async function updateUserIsPlayer(userId: string, isPlayer: boolean) {
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

  // Players are players by role; only an admin is marked as also playing
  const { data: target } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (target?.role !== "admin") return { error: "Only admins can be marked as players" };

  const { error } = await supabase
    .from("profiles")
    .update({ is_player: isPlayer, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) return { error: error.message };

  return { success: true };
}
