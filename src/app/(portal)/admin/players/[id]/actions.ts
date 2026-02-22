"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generatePassword } from "@/lib/utils/password";

export async function updatePlayer(playerId: string, formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();

  if (!firstName || !lastName) {
    return { error: "First name and last name are required" };
  }

  const { error } = await admin
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      email: (formData.get("email") as string)?.trim() || null,
      phone: (formData.get("phone") as string)?.trim() || null,
      date_of_birth: (formData.get("date_of_birth") as string)?.trim() || null,
      area: (formData.get("area") as string)?.trim() || null,
      playing_level: (formData.get("playing_level") as string)?.trim() || null,
      training_goals: (formData.get("training_goals") as string)?.trim() || null,
      health_conditions: (formData.get("health_conditions") as string)?.trim() || null,
      height: formData.get("height") ? Number(formData.get("height")) : null,
      weight: formData.get("weight") ? Number(formData.get("weight")) : null,
      preferred_hand: (formData.get("preferred_hand") as string)?.trim() || null,
      preferred_position: (formData.get("preferred_position") as string)?.trim() || null,
      guardian_name: (formData.get("guardian_name") as string)?.trim() || null,
      guardian_phone: (formData.get("guardian_phone") as string)?.trim() || null,
      is_active: formData.get("is_active") === "true",
    })
    .eq("id", playerId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/players/${playerId}`);
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");

  return { success: true };
}

export async function updatePlayerLevel(playerId: string, level: string | null) {
  const admin = createAdminClient();
  type PlayingLevel = "beginner" | "intermediate" | "advanced" | "professional";
  const { error } = await admin
    .from("profiles")
    .update({ playing_level: (level as PlayingLevel) || null })
    .eq("id", playerId);
  if (error) return { error: error.message };
  revalidatePath("/admin/players");
  return { success: true };
}

export async function resetPlayerPassword(playerId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const password = generatePassword();

  const { data, error } = await admin.auth.admin.updateUserById(playerId, {
    password,
    email_confirm: true,
  });

  if (error) return { error: error.message };
  if (!data?.user) return { error: "User not found in auth system" };

  // Sign out all existing sessions so the new password takes effect immediately
  await admin.auth.admin.signOut(playerId, "global");

  return { success: true, password };
}
