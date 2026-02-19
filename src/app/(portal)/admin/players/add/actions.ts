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
  if (!packageId || !startDate || !endDate) {
    return { error: "Package, start date, and end date are required" };
  }
  if (!sessionsTotal || !amount || !paymentMethod) {
    return { error: "Sessions total, amount, and payment method are required" };
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
    role: "player",
    is_active: true,
    profile_completed: true,
  });

  if (profileError) {
    return { error: `Profile creation failed: ${profileError.message}` };
  }

  // 3. Create subscription
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

  // 4. Create payment
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

  // Fetch packages for name→id mapping
  const { data: packages } = await admin
    .from("packages")
    .select("id, name")
    .eq("is_active", true);

  const packageMap = new Map<string, string>();
  (packages || []).forEach((p: { id: string; name: string }) => {
    packageMap.set(p.name.toLowerCase(), p.id);
  });

  const results: BulkPlayerResult[] = [];

  for (const row of rows) {
    const name = `${row.first_name} ${row.last_name}`;

    if (!row.first_name || !row.last_name || !row.email) {
      results.push({ name, email: row.email, status: "error", error: "Missing required fields" });
      continue;
    }

    const packageId = packageMap.get(row.package_name.toLowerCase());
    if (!packageId) {
      results.push({ name, email: row.email, status: "error", error: `Package "${row.package_name}" not found` });
      continue;
    }

    try {
      const password = generatePassword();
      const email = row.email.trim().toLowerCase();

      // Create auth user
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        const msg = authError.message?.includes("already been registered")
          ? "Email already exists"
          : authError.message;
        results.push({ name, email, status: "error", error: msg });
        continue;
      }

      const userId = authData.user.id;

      // Create profile
      await admin.from("profiles").insert({
        id: userId,
        first_name: row.first_name.trim(),
        last_name: row.last_name.trim(),
        email,
        phone: row.phone?.trim() || null,
        role: "player",
        is_active: true,
        profile_completed: true,
      });

      // Create subscription
      const { data: subscription } = await admin
        .from("subscriptions")
        .insert({
          player_id: userId,
          package_id: packageId,
          sessions_remaining: row.sessions_remaining,
          sessions_total: row.sessions_total,
          start_date: row.start_date,
          end_date: row.end_date,
          status: "active",
        })
        .select("id")
        .single();

      // Create payment
      if (subscription) {
        await admin.from("payments").insert({
          player_id: userId,
          subscription_id: subscription.id,
          amount: row.amount,
          method: row.method,
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
        });
      }

      results.push({ name, email, status: "success", password });
    } catch (err) {
      results.push({ name, email: row.email, status: "error", error: "Unexpected error" });
    }
  }

  revalidatePath("/admin/players");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");

  return results;
}
