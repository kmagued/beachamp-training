"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function submitSubscription(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const packageId = formData.get("package_id") as string;
  const method = formData.get("method") as string;

  if (!packageId || !method) return { error: "Please select a package and payment method" };

  const screenshot = formData.get("screenshot") as File | null;
  if (method === "instapay" && (!screenshot || screenshot.size === 0)) {
    return { error: "Payment screenshot is required for Instapay" };
  }

  // Save training info if provided (first-time subscribers)
  const playingLevel = formData.get("playing_level") as string | null;
  const trainingGoals = formData.get("training_goals") as string | null;
  const healthConditions = formData.get("health_conditions") as string | null;

  if (playingLevel || trainingGoals || healthConditions) {
    const updates: Record<string, unknown> = { profile_completed: true };
    if (playingLevel) updates.playing_level = playingLevel;
    if (trainingGoals) updates.training_goals = trainingGoals;
    if (healthConditions) updates.health_conditions = healthConditions;

    await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);
  }

  // Fetch the package to get details
  const { data: pkg } = await supabase
    .from("packages")
    .select("*")
    .eq("id", packageId)
    .single();

  if (!pkg) return { error: "Package not found" };

  // Create subscription (pending)
  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .insert({
      player_id: user.id,
      package_id: packageId,
      sessions_remaining: pkg.session_count,
      sessions_total: pkg.session_count,
      status: "pending",
    })
    .select()
    .single();

  if (subError) return { error: subError.message };

  // Handle screenshot upload
  let screenshotUrl: string | null = null;
  if (screenshot && screenshot.size > 0) {
    const path = `${user.id}/${Date.now()}_${screenshot.name}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-screenshots")
      .upload(path, screenshot, { contentType: screenshot.type });

    if (!uploadError) {
      screenshotUrl = path;
    }
  }

  // Create payment (pending)
  const { error: payError } = await supabase.from("payments").insert({
    player_id: user.id,
    subscription_id: subscription.id,
    amount: pkg.price,
    method,
    screenshot_url: screenshotUrl,
    status: "pending",
  });

  if (payError) return { error: payError.message };

  revalidatePath("/player/dashboard");
  revalidatePath("/player/subscribe");
  return { success: true };
}
