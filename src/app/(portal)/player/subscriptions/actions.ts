"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";

export async function playerFreezeSubscription(subscriptionId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Verify the subscription belongs to the current player
  const { data: sub, error: fetchError } = await admin
    .from("subscriptions")
    .select("id, status, end_date, player_id, sessions_total")
    .eq("id", subscriptionId)
    .single();

  if (fetchError || !sub) return { error: "Subscription not found" };
  if (sub.player_id !== currentUser.id) return { error: "Not authorized" };
  if (sub.status !== "active") return { error: "Only active subscriptions can be frozen" };
  if (sub.sessions_total <= 1) return { error: "Single-session packages cannot be frozen" };

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
    reason: "Player requested freeze",
  });

  revalidatePath("/player/subscriptions");
  revalidatePath("/player/dashboard");
  return { success: true };
}

export async function playerUnfreezeSubscription(subscriptionId: string) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: sub, error: fetchError } = await admin
    .from("subscriptions")
    .select("id, status, frozen_at, frozen_days_remaining, player_id")
    .eq("id", subscriptionId)
    .single();

  if (fetchError || !sub) return { error: "Subscription not found" };
  if (sub.player_id !== currentUser.id) return { error: "Not authorized" };
  if (sub.status !== "frozen") return { error: "Subscription is not frozen" };

  // Calculate new end date: today + remaining days
  const newEndDate = sub.frozen_days_remaining
    ? new Date(Date.now() + sub.frozen_days_remaining * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0]
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

  revalidatePath("/player/subscriptions");
  revalidatePath("/player/dashboard");
  return { success: true };
}
