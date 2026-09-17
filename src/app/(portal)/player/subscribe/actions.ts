"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyAdmins } from "@/app/_actions/notifications";
import { computeRenewalStartDate } from "@/lib/subscriptions/renewal";

export async function submitSubscription(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const packageId = formData.get("package_id") as string;
  const method = formData.get("method") as string | null;
  const screenshot = formData.get("screenshot") as File | null;

  if (!packageId) return { error: "Please select a package" };

  const promoCodeId = formData.get("promo_code_id") as string | null;

  // Fetch the package to get details
  const { data: pkg } = await supabase
    .from("packages")
    .select("*")
    .eq("id", packageId)
    .single();

  if (!pkg) return { error: "Package not found" };

  // Validate and calculate promo discount
  let finalPrice = pkg.price;
  let discountAmount = 0;
  let validPromoId: string | null = null;

  if (promoCodeId) {
    const { data: promo } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("id", promoCodeId)
      .eq("is_active", true)
      .single();

    if (!promo) return { error: "Invalid or expired promo code" };

    // Check expiry
    if (promo.expiry_date) {
      const today = new Date().toISOString().split("T")[0];
      if (promo.expiry_date < today) return { error: "Promo code has expired" };
    }

    // Check max uses
    if (promo.max_uses !== null) {
      const { count } = await supabase
        .from("promo_code_uses")
        .select("*", { count: "exact", head: true })
        .eq("promo_code_id", promo.id);
      if ((count || 0) >= promo.max_uses) return { error: "Promo code usage limit reached" };
    }

    // Check per-player limit
    if (promo.per_player_limit) {
      const { count } = await supabase
        .from("promo_code_uses")
        .select("*", { count: "exact", head: true })
        .eq("promo_code_id", promo.id)
        .eq("player_id", user.id);
      if ((count || 0) >= promo.per_player_limit) return { error: "You have already used this promo code" };
    }

    // Check package restriction
    if (promo.package_ids && promo.package_ids.length > 0) {
      if (!promo.package_ids.includes(packageId)) return { error: "Promo code not valid for this package" };
    }

    // Calculate discount
    if (promo.discount_type === "percentage") {
      discountAmount = Math.round(pkg.price * (promo.discount_value / 100) * 100) / 100;
    } else {
      discountAmount = Number(promo.discount_value);
    }
    finalPrice = Math.max(0, Math.round((pkg.price - discountAmount) * 100) / 100);
    validPromoId = promo.id;
  }

  // A fully discounted package has nothing to pay, so no method or screenshot
  const isFree = finalPrice === 0;
  if (!isFree) {
    if (!method) return { error: "Please select a payment method" };
    if (method === "instapay" && (!screenshot || screenshot.size === 0)) {
      return { error: "Payment screenshot is required for Instapay" };
    }
  }

  // Save training info if provided (first-time subscribers)
  const trainingGoals = formData.get("training_goals") as string | null;
  const healthConditions = formData.get("health_conditions") as string | null;

  if (trainingGoals || healthConditions) {
    const updates: Record<string, unknown> = { profile_completed: true };
    if (trainingGoals) updates.training_goals = trainingGoals;
    if (healthConditions) updates.health_conditions = healthConditions;

    await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();
  const playerName = profile ? `${profile.first_name} ${profile.last_name}` : "A player";

  if (isFree) {
    // Nothing to confirm, so activate now with the same dates payment confirmation would set.
    // (payments.amount must be > 0, so a free subscription has no payment row.)
    const startDate = await computeRenewalStartDate(supabase, user.id);
    const endDate = pkg.session_count === 1
      ? null
      : (() => {
          const d = new Date(startDate);
          d.setDate(d.getDate() + pkg.validity_days);
          return d.toISOString().split("T")[0];
        })();

    const { data: freeSub, error: freeSubError } = await supabase
      .from("subscriptions")
      .insert({
        player_id: user.id,
        package_id: packageId,
        sessions_remaining: pkg.session_count,
        sessions_total: pkg.session_count,
        status: "active",
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate,
        promo_code_id: validPromoId,
      })
      .select()
      .single();

    if (freeSubError) return { error: freeSubError.message };

    if (validPromoId) {
      await supabase.from("promo_code_uses").insert({
        promo_code_id: validPromoId,
        player_id: user.id,
        subscription_id: freeSub.id,
        payment_id: null,
        discount_amount: discountAmount,
      });
    }

    await notifyAdmins({
      title: "New Subscription",
      body: `${playerName} subscribed to ${pkg.name} for free${validPromoId ? " with a promo code" : ""}. The subscription is active.`,
      type: "subscription",
      link: `/admin/players/${user.id}`,
    });

    revalidatePath("/player/dashboard");
    revalidatePath("/player/subscribe");
    revalidatePath("/player/subscriptions");
    return { success: true, activated: true };
  }

  // Create subscription (pending)
  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .insert({
      player_id: user.id,
      package_id: packageId,
      sessions_remaining: pkg.session_count,
      sessions_total: pkg.session_count,
      status: "pending",
      promo_code_id: validPromoId,
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
  const { data: payment, error: payError } = await supabase.from("payments").insert({
    player_id: user.id,
    subscription_id: subscription.id,
    amount: finalPrice,
    method,
    screenshot_url: screenshotUrl,
    status: "pending",
    promo_code_id: validPromoId,
  }).select().single();

  if (payError) {
    // Don't leave a subscription behind without its payment. Players can't delete
    // subscriptions under RLS, so clean up with the service role.
    const admin = createAdminClient();
    await admin.from("subscriptions").delete().eq("id", subscription.id);
    if (screenshotUrl) await admin.storage.from("payment-screenshots").remove([screenshotUrl]);
    return { error: payError.message };
  }

  // Record promo code usage
  if (validPromoId && payment) {
    await supabase.from("promo_code_uses").insert({
      promo_code_id: validPromoId,
      player_id: user.id,
      subscription_id: subscription.id,
      payment_id: payment.id,
      discount_amount: discountAmount,
    });
  }

  // Notify admins of new subscription
  await notifyAdmins({
    title: "New Subscription",
    body: `${playerName} subscribed to ${pkg.name}. Payment pending review.`,
    type: "payment",
    link: "/admin/payments?statusFilter=Pending",
  });

  revalidatePath("/player/dashboard");
  revalidatePath("/player/subscribe");
  return { success: true };
}
