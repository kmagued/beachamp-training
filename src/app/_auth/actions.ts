"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message };
  }

  // Fetch role to determine redirect
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Authentication failed" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

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
  const playingLevel = formData.get("playing_level") as string;
  const trainingGoals = formData.get("training_goals") as string;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        phone,
        role: "player",
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Update the profile with additional fields
  if (data.user) {
    await supabase
      .from("profiles")
      .update({
        area,
        playing_level: playingLevel || null,
        training_goals: trainingGoals || null,
        phone,
      })
      .eq("id", data.user.id);
  }

  redirect("/player/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
