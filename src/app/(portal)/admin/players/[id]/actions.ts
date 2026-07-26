"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { addDays, cairoToday, daysBetween } from "@/lib/utils/cairo-time";

/** Confirm the caller is a signed-in admin. The actions below write with the
 *  service-role key, and a server action is a POST endpoint any authenticated
 *  user can reach — route middleware only guards the page. */
async function assertAdmin(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not authorized";

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return callerProfile?.role === "admin" ? null : "Not authorized";
}

export async function updatePlayer(playerId: string, formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  const newEmail = (formData.get("email") as string)?.trim();

  if (!firstName || !lastName) {
    return { error: "First name and last name are required" };
  }

  // Sync auth email when the admin changes it (e.g. replacing migration placeholders)
  if (newEmail) {
    const { data: existing } = await admin.auth.admin.getUserById(playerId);
    if (existing?.user && existing.user.email !== newEmail) {
      const { error: authErr } = await admin.auth.admin.updateUserById(playerId, {
        email: newEmail,
        email_confirm: true,
      });
      if (authErr) return { error: `Failed to update email: ${authErr.message}` };
    }
  }

  const createdAt = (formData.get("created_at") as string)?.trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    first_name: firstName,
    last_name: lastName,
    email: newEmail || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    date_of_birth: (formData.get("date_of_birth") as string)?.trim() || null,
    area: (formData.get("area") as string)?.trim() || null,
    gender: (formData.get("gender") as string)?.trim() || null,
    occupation: (formData.get("occupation") as string)?.trim() || null,
    playing_level: (formData.get("playing_level") as string)?.trim() || null,
    training_goals: (formData.get("training_goals") as string)?.trim() || null,
    health_conditions: (formData.get("health_conditions") as string)?.trim() || null,
    height: formData.get("height") ? Number(formData.get("height")) : null,
    weight: formData.get("weight") ? Number(formData.get("weight")) : null,
    preferred_hand: (formData.get("preferred_hand") as string)?.trim() || null,
    preferred_position: (formData.get("preferred_position") as string)?.trim() || null,
    guardian_name: (formData.get("guardian_name") as string)?.trim() || null,
    guardian_phone: (formData.get("guardian_phone") as string)?.trim() || null,
  };

  if (createdAt) {
    updateData.created_at = new Date(createdAt).toISOString();
  }

  const { error } = await admin
    .from("profiles")
    .update(updateData)
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

export async function bulkUpdatePlayerLevel(playerIds: string[], level: string | null) {
  const admin = createAdminClient();
  type PlayingLevel = "beginner" | "intermediate" | "advanced" | "professional";
  const { error } = await admin
    .from("profiles")
    .update({ playing_level: (level as PlayingLevel) || null })
    .in("id", playerIds);
  if (error) return { error: error.message };
  revalidatePath("/admin/players");
  return { success: true };
}

export async function updateSubscriptionBalance(
  subscriptionId: string,
  sessionsRemaining: number,
  sessionsTotal: number
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from("subscriptions")
    .update({ sessions_remaining: sessionsRemaining, sessions_total: sessionsTotal })
    .eq("id", subscriptionId);

  if (error) return { error: error.message };

  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** Move a subscription's expiry date. Used for goodwill extensions when a
 *  player misses sessions, and to correct a wrong auto-derived date.
 *
 *  Pushing the date past today revives a lapsed subscription: "expired" is
 *  derived from end_date at read time for multi-session subs, never stored. */
export async function updateSubscriptionEndDate(
  subscriptionId: string,
  endDate: string
) {
  const authError = await assertAdmin();
  if (authError) return { error: authError };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (!endDate) return { error: "End date is required" };
  // Guard the format before the string comparison below relies on it
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) {
    return { error: "Invalid date" };
  }

  const { data: sub, error: fetchError } = await admin
    .from("subscriptions")
    .select("id, status, start_date, end_date, sessions_total, player_id")
    .eq("id", subscriptionId)
    .single();

  if (fetchError || !sub) return { error: "Subscription not found" };
  if (sub.sessions_total === 1) {
    return { error: "Single-session subscriptions don't have an expiry date" };
  }
  // ISO dates compare correctly as strings
  if (sub.start_date && endDate < sub.start_date) {
    return { error: "End date cannot be before the start date" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = { end_date: endDate };

  // A frozen sub's end_date is rewritten on unfreeze as today + frozen_days_remaining,
  // so bank the granted days there too or the edit is discarded on thaw.
  if (sub.status === "frozen") {
    updateData.frozen_days_remaining = Math.max(0, daysBetween(cairoToday(), endDate));
  }

  const { error } = await admin
    .from("subscriptions")
    .update(updateData)
    .eq("id", subscriptionId);

  if (error) return { error: error.message };

  revalidatePath(`/admin/players/${sub.player_id}`);
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function deletePlayer(playerId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Delete auth user (profile cascade-deletes via FK)
  const { error } = await admin.auth.admin.deleteUser(playerId);
  if (error) return { error: error.message };

  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");

  return { success: true };
}

export async function freezeSubscription(subscriptionId: string, reason?: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Get current subscription
  const { data: sub, error: fetchError } = await admin
    .from("subscriptions")
    .select("id, status, end_date, player_id")
    .eq("id", subscriptionId)
    .single();

  if (fetchError || !sub) return { error: "Subscription not found" };
  if (sub.status !== "active") return { error: "Only active subscriptions can be frozen" };

  // Calculate remaining days
  const daysRemaining = sub.end_date
    ? Math.max(0, Math.ceil((new Date(sub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // Update subscription
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({
      status: "frozen",
      frozen_at: new Date().toISOString(),
      frozen_days_remaining: daysRemaining,
    })
    .eq("id", subscriptionId);

  if (updateError) return { error: updateError.message };

  // Record freeze in history
  await admin.from("subscription_freezes").insert({
    subscription_id: subscriptionId,
    reason: reason || null,
  });

  revalidatePath(`/admin/players/${sub.player_id}`);
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function unfreezeSubscription(subscriptionId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: sub, error: fetchError } = await admin
    .from("subscriptions")
    .select("id, status, frozen_at, frozen_days_remaining, player_id")
    .eq("id", subscriptionId)
    .single();

  if (fetchError || !sub) return { error: "Subscription not found" };
  if (sub.status !== "frozen") return { error: "Subscription is not frozen" };

  // Calculate new end date: today + remaining days. Cairo's calendar day, not
  // the server's — Vercel runs UTC, which rolls over 2-3 hours late.
  const newEndDate = sub.frozen_days_remaining
    ? addDays(cairoToday(), sub.frozen_days_remaining)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    status: "active",
    frozen_at: null,
    frozen_days_remaining: null,
  };
  if (newEndDate) updateData.end_date = newEndDate;

  const { error: updateError } = await admin
    .from("subscriptions")
    .update(updateData)
    .eq("id", subscriptionId);

  if (updateError) return { error: updateError.message };

  // Update freeze history
  const daysFrozen = sub.frozen_at
    ? Math.ceil((Date.now() - new Date(sub.frozen_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  await admin
    .from("subscription_freezes")
    .update({
      unfrozen_at: new Date().toISOString(),
      days_frozen: daysFrozen,
    })
    .eq("subscription_id", subscriptionId)
    .is("unfrozen_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  revalidatePath(`/admin/players/${sub.player_id}`);
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

