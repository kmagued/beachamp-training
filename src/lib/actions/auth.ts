"use server";

import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Authentication failed" };

  // Check if profile is completed
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, profile_completed")
    .eq("id", user.id)
    .returns<Pick<Profile, "role" | "profile_completed">[]>()
    .single();

  if (profile && !profile.profile_completed) {
    redirect("/complete-profile");
  }

  const role = profile?.role || "player";
  const redirectTo =
    role === "admin" ? "/admin/dashboard" : role === "coach" ? "/coach/dashboard" : "/player/dashboard";

  redirect(redirectTo);
}

export async function register(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;
  const phone = formData.get("phone") as string;
  const area = formData.get("area") as string;
  const dateOfBirth = formData.get("date_of_birth") as string;

  // signUp with minimal metadata — profile is created via admin client below
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Create profile + auto-confirm email using admin client (service role)
  if (data.user) {
    // Auto-confirm email so login works without SMTP setup
    await admin.auth.admin.updateUserById(data.user.id, {
      email_confirm: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (admin as any).from("profiles").insert({
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      area,
      date_of_birth: dateOfBirth || null,
      role: "player",
    });

    if (profileError) {
      console.error("[register] Profile creation error:", profileError);
    }
  }

  redirect("/complete-profile");
}

export async function completeProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const playingLevel = formData.get("playing_level") as string;
  const trainingGoals = formData.get("training_goals") as string;
  const healthConditions = formData.get("health_conditions") as string;
  const preferredPackageId = formData.get("preferred_package_id") as string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("profiles")
    .update({
      playing_level: playingLevel || null,
      training_goals: trainingGoals || null,
      health_conditions: healthConditions || null,
      preferred_package_id: preferredPackageId || null,
      profile_completed: true,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  redirect("/player/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
