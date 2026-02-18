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

  const loginEmail = formData.get("email") as string;

  if (error) {
    // Handle unverified email error from Supabase
    if (error.message === "Email not confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(loginEmail)}`);
    }
    return { error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Authentication failed" };

  // Check if email is verified
  if (!user.email_confirmed_at) {
    redirect(`/verify-email?email=${encodeURIComponent(loginEmail)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .returns<Pick<Profile, "role">[]>()
    .single();

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

  // signUp — Supabase sends an OTP code to the email
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Create profile using admin client (service role) — email stays unverified
  if (data.user) {
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

  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function verifyEmailOtp(email: string, token: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });

  if (error) {
    return { error: error.message };
  }

  // Determine redirect based on role
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Verification failed" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .returns<Pick<Profile, "role">[]>()
    .single();

  const role = profile?.role || "player";
  const redirectTo =
    role === "admin" ? "/admin/dashboard" : role === "coach" ? "/coach/dashboard" : "/player/dashboard";

  redirect(redirectTo);
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

export async function registerAdmin(formData: FormData) {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return { error: "Admin registration is only available in development mode" };
  }

  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("first_name") as string;
  const lastName = formData.get("last_name") as string;

  if (!email || !password || !firstName || !lastName) {
    return { error: "All fields are required" };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  // Create user via admin client
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileError } = await (admin as any).from("profiles").insert({
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      role: "admin",
      profile_completed: true,
    });

    if (profileError) {
      console.error("[registerAdmin] Profile creation error:", profileError);
      return { error: "User created but profile creation failed: " + profileError.message };
    }
  }

  return { success: true };
}

export async function resendVerificationEmail(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function sendPasswordReset(email: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function resetPasswordWithOtp(
  email: string,
  token: string,
  newPassword: string
) {
  const supabase = await createClient();

  // Verify the OTP token
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });

  if (verifyError) {
    return { error: verifyError.message };
  }

  // Update the password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { error: updateError.message };
  }

  redirect("/login");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
