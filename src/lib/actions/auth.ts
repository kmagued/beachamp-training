"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  // Check email verification
  if (!user.email_confirmed_at) {
    await supabase.auth.signOut();
    return { error: "Please verify your email before signing in. Check your inbox for the verification link." };
  }

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
    role === "admin"
      ? "/admin/dashboard"
      : role === "coach"
        ? "/coach/dashboard"
        : "/player/dashboard";

  redirect(redirectTo);
}

export async function register(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;
  const phone = formData.get("phone") as string;
  const area = formData.get("area") as string;
  const dateOfBirth = formData.get("date_of_birth") as string;

  console.log("[register] Starting signup for:", email);
  console.log("[register] Metadata:", { firstName, lastName, phone, area, dateOfBirth });

  // First, try signUp without metadata to isolate the issue
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  console.log("[register] signUp response - error:", error);
  console.log("[register] signUp response - user:", data?.user?.id ?? "no user");

  if (error) {
    console.error("[register] signUp error:", error.message, error.status);
    return { error: error.message };
  }

  // Update profile with all fields (trigger creates minimal row, we fill in the rest)
  if (data.user) {
    console.log("[register] Updating profile for user:", data.user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone,
        area,
        date_of_birth: dateOfBirth || null,
      })
      .eq("id", data.user.id);

    if (updateError) {
      console.error("[register] Profile update error:", updateError);
    } else {
      console.log("[register] Profile updated successfully");
    }
  }

  redirect("/verify-email");
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
