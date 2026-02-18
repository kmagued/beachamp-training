"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: formData.get("first_name") as string,
      last_name: formData.get("last_name") as string,
      phone: (formData.get("phone") as string) || null,
      date_of_birth: (formData.get("date_of_birth") as string) || null,
      area: (formData.get("area") as string) || null,
      playing_level: (formData.get("playing_level") as string) || null,
      training_goals: (formData.get("training_goals") as string) || null,
      health_conditions: (formData.get("health_conditions") as string) || null,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/player/profile");
  revalidatePath("/player/dashboard");
  return { success: true };
}
