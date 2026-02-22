"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generatePassword } from "@/lib/utils/password";
import type { PaymentMethod } from "@/types/database";
import type { BulkPlayerRow, BulkPlayerResult } from "./_components/types";

interface AddPlayerResult {
  success?: boolean;
  error?: string;
  password?: string;
  playerName?: string;
}

export async function addSinglePlayer(formData: FormData): Promise<AddPlayerResult> {
  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const dateOfBirth = (formData.get("date_of_birth") as string)?.trim() || null;
  const area = (formData.get("area") as string)?.trim() || null;
  const playingLevel = (formData.get("playing_level") as string)?.trim() || null;
  const trainingGoals = (formData.get("training_goals") as string)?.trim() || null;
  const healthConditions = (formData.get("health_conditions") as string)?.trim() || null;
  const height = formData.get("height") ? Number(formData.get("height")) : null;
  const weight = formData.get("weight") ? Number(formData.get("weight")) : null;
  const preferredHand = (formData.get("preferred_hand") as string)?.trim() || null;
  const preferredPosition = (formData.get("preferred_position") as string)?.trim() || null;
  const guardianName = (formData.get("guardian_name") as string)?.trim() || null;
  const guardianPhone = (formData.get("guardian_phone") as string)?.trim() || null;
  const packageId = formData.get("package_id") as string;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;
  const sessionsRemaining = Number(formData.get("sessions_remaining"));
  const sessionsTotal = Number(formData.get("sessions_total"));
  const amount = Number(formData.get("amount"));
  const paymentMethod = formData.get("payment_method") as PaymentMethod;

  if (!firstName || !lastName || !email) {
    return { error: "First name, last name, and email are required" };
  }

  const hasSubscription = !!packageId;
  if (hasSubscription) {
    if (!startDate || !endDate) {
      return { error: "Start date and end date are required for subscriptions" };
    }
    if (!sessionsTotal || !amount || !paymentMethod) {
      return { error: "Sessions total, amount, and payment method are required for subscriptions" };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const password = generatePassword();

  // 1. Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message?.includes("already been registered")) {
      return { error: "A user with this email already exists" };
    }
    return { error: authError.message };
  }

  const userId = authData.user.id;

  // 2. Create profile
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    date_of_birth: dateOfBirth,
    area,
    playing_level: playingLevel,
    training_goals: trainingGoals,
    health_conditions: healthConditions,
    height,
    weight,
    preferred_hand: preferredHand,
    preferred_position: preferredPosition,
    guardian_name: guardianName,
    guardian_phone: guardianPhone,
    role: "player",
    is_active: true,
    profile_completed: true,
  });

  if (profileError) {
    return { error: `Profile creation failed: ${profileError.message}` };
  }

  // 3. Create subscription + payment (if package selected)
  if (hasSubscription) {
    const { data: subscription, error: subError } = await admin
      .from("subscriptions")
      .insert({
        player_id: userId,
        package_id: packageId,
        sessions_remaining: sessionsRemaining,
        sessions_total: sessionsTotal,
        start_date: startDate,
        end_date: endDate,
        status: "active",
      })
      .select("id")
      .single();

    if (subError) {
      return { error: `Subscription creation failed: ${subError.message}` };
    }

    const { error: payError } = await admin.from("payments").insert({
      player_id: userId,
      subscription_id: subscription.id,
      amount,
      method: paymentMethod,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });

    if (payError) {
      return { error: `Payment creation failed: ${payError.message}` };
    }
  }

  revalidatePath("/admin/players");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");

  return {
    success: true,
    password,
    playerName: `${firstName} ${lastName}`,
  };
}

export async function addBulkPlayers(rows: BulkPlayerRow[]): Promise<BulkPlayerResult[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const results: BulkPlayerResult[] = [];

  for (const row of rows) {
    const name = `${row.first_name} ${row.last_name}`;

    if (!row.first_name || !row.last_name || !row.email) {
      results.push({ name, email: row.email, status: "error", error: "Missing required fields" });
      continue;
    }

    let userId: string | null = null;

    try {
      const email = row.email.trim().toLowerCase();
      let isUpdate = false;

      // 1. Try to create auth user
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: generatePassword(),
        email_confirm: true,
        user_metadata: {
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          role: "player",
        },
      });

      if (authError) {
        if (authError.message?.includes("already been registered")) {
          // Existing user — look up their ID and update profile
          const { data: existingProfile } = await admin
            .from("profiles")
            .select("id")
            .eq("email", email)
            .single();

          if (!existingProfile) {
            results.push({ name, email, status: "error", error: "User exists in auth but profile not found" });
            continue;
          }
          userId = existingProfile.id;
          isUpdate = true;
        } else {
          results.push({ name, email, status: "error", error: authError.message });
          continue;
        }
      } else {
        userId = authData.user.id;
      }

      // 2. Create or update profile
      const { error: profileError } = await admin.from("profiles").upsert({
        id: userId,
        first_name: row.first_name.trim(),
        last_name: row.last_name.trim(),
        email,
        phone: row.phone?.trim() || null,
        date_of_birth: row.date_of_birth || null,
        area: row.area?.trim() || null,
        height: row.height ?? null,
        weight: row.weight ?? null,
        preferred_hand: row.preferred_hand?.trim().toLowerCase() || null,
        preferred_position: row.preferred_position?.trim().toLowerCase() || null,
        health_conditions: row.health_conditions?.trim() || null,
        training_goals: row.training_goals?.trim() || null,
        guardian_name: row.guardian_name || null,
        guardian_phone: row.guardian_phone || null,
        role: "player",
        is_active: true,
        ...(isUpdate ? {} : { profile_completed: false }),
      }, { onConflict: "id" });

      if (profileError) {
        if (!isUpdate) await admin.auth.admin.deleteUser(userId);
        results.push({ name, email, status: "error", error: `Profile: ${profileError.message}` });
        continue;
      }

      results.push({ name, email, status: isUpdate ? "updated" : "success" });
    } catch (err) {
      // Clean up orphaned auth user if profile step failed
      if (userId) {
        try { await admin.auth.admin.deleteUser(userId); } catch { /* ignore cleanup errors */ }
      }
      const msg = err instanceof Error ? err.message : "Unexpected error";
      results.push({ name, email: row.email, status: "error", error: msg });
    }
  }

  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");

  return results;
}

export async function checkExistingEmails(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("email")
    .in("email", emails.map((e) => e.toLowerCase()));
  return (data || []).filter((p) => p.email).map((p) => p.email!.toLowerCase());
}
