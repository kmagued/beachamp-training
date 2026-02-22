"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@/types/database";

export async function confirmPayment(paymentId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch payment + subscription + package
  const { data: payment } = await supabase
    .from("payments")
    .select("*, subscriptions(*, packages(*))")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };
  if (payment.status !== "pending") return { error: "Payment is not pending" };

  const pkg = payment.subscriptions?.packages;
  if (!pkg) return { error: "Package not found for this subscription" };

  // Check if the player has an existing active subscription that hasn't expired
  const { data: existingActiveSub } = await supabase
    .from("subscriptions")
    .select("end_date")
    .eq("player_id", payment.player_id)
    .eq("status", "active")
    .neq("id", payment.subscription_id)
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const today = new Date();
  let startDate = today;

  if (existingActiveSub?.end_date) {
    const activeEndDate = new Date(existingActiveSub.end_date);
    if (activeEndDate > today) {
      // Start new subscription the day after current one ends
      startDate = new Date(activeEndDate);
      startDate.setDate(startDate.getDate() + 1);
    }
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + pkg.validity_days);

  // Update payment
  const { error: payError } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (payError) return { error: payError.message };

  // Activate subscription
  const { error: subError } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
    })
    .eq("id", payment.subscription_id);

  if (subError) return { error: subError.message };

  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/player/subscriptions");
  revalidatePath("/player/dashboard");
  return { success: true };
}

export async function rejectPayment(paymentId: string, reason: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: payment } = await supabase
    .from("payments")
    .select("subscription_id, status")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };
  if (payment.status !== "pending") return { error: "Payment is not pending" };

  // Update payment
  const { error: payError } = await supabase
    .from("payments")
    .update({
      status: "rejected",
      rejection_reason: reason,
    })
    .eq("id", paymentId);

  if (payError) return { error: payError.message };

  // Cancel subscription
  const { error: subError } = await supabase
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("id", payment.subscription_id);

  if (subError) return { error: subError.message };

  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/player/subscriptions");
  return { success: true };
}

export async function updatePayment(
  paymentId: string,
  updates: { amount?: number; method?: string; status?: string }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, subscription_id, player_id, subscriptions(*, packages(*))")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };

  const paymentUpdate: Record<string, unknown> = {};
  if (updates.amount !== undefined) paymentUpdate.amount = updates.amount;
  if (updates.method !== undefined) paymentUpdate.method = updates.method;

  // Handle status change
  if (updates.status && updates.status !== payment.status) {
    paymentUpdate.status = updates.status;

    if (updates.status === "confirmed") {
      paymentUpdate.confirmed_by = user.id;
      paymentUpdate.confirmed_at = new Date().toISOString();
      paymentUpdate.rejection_reason = null;

      // Activate subscription with proper dates
      const pkg = payment.subscriptions?.packages;
      if (pkg) {
        const { data: existingActiveSub } = await supabase
          .from("subscriptions")
          .select("end_date")
          .eq("player_id", payment.player_id)
          .eq("status", "active")
          .neq("id", payment.subscription_id)
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const today = new Date();
        let startDate = today;
        if (existingActiveSub?.end_date) {
          const activeEndDate = new Date(existingActiveSub.end_date);
          if (activeEndDate > today) {
            startDate = new Date(activeEndDate);
            startDate.setDate(startDate.getDate() + 1);
          }
        }
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + pkg.validity_days);

        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
          })
          .eq("id", payment.subscription_id);
      }
    } else if (updates.status === "pending") {
      paymentUpdate.confirmed_by = null;
      paymentUpdate.confirmed_at = null;
      paymentUpdate.rejection_reason = null;

      await supabase
        .from("subscriptions")
        .update({ status: "pending", start_date: null, end_date: null })
        .eq("id", payment.subscription_id);
    } else if (updates.status === "rejected") {
      paymentUpdate.confirmed_by = null;
      paymentUpdate.confirmed_at = null;

      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("id", payment.subscription_id);
    }
  }

  if (Object.keys(paymentUpdate).length === 0) return { error: "No changes provided" };

  const { error } = await supabase
    .from("payments")
    .update(paymentUpdate)
    .eq("id", paymentId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/player/subscriptions");
  revalidatePath("/player/dashboard");
  return { success: true };
}

export async function bulkUpdatePaymentStatus(paymentIds: string[], status: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const results = { success: 0, failed: 0 };

  for (const id of paymentIds) {
    const res = await updatePayment(id, { status });
    if ("error" in res) results.failed++;
    else results.success++;
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  return { success: true, results };
}

export async function createAdminPayment(data: {
  player_id: string;
  package_id: string;
  amount: number;
  method: PaymentMethod;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return { error: "Unauthorized" };

  // Get package details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: pkg, error: pkgError } = await admin
    .from("packages")
    .select("id, session_count, validity_days")
    .eq("id", data.package_id)
    .single();

  if (pkgError || !pkg) return { error: "Package not found" };

  // Smart start_date: if player has active sub ending in future, start after it
  const today = new Date();
  let startDate = today;

  const { data: existingActiveSub } = await admin
    .from("subscriptions")
    .select("end_date")
    .eq("player_id", data.player_id)
    .eq("status", "active")
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingActiveSub?.end_date) {
    const activeEndDate = new Date(existingActiveSub.end_date);
    if (activeEndDate > today) {
      startDate = new Date(activeEndDate);
      startDate.setDate(startDate.getDate() + 1);
    }
  }

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + pkg.validity_days);

  const isCash = data.method === "cash";

  // Create subscription
  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .insert({
      player_id: data.player_id,
      package_id: data.package_id,
      sessions_remaining: pkg.session_count,
      sessions_total: pkg.session_count,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      status: isCash ? "active" : "pending",
    })
    .select("id")
    .single();

  if (subError) return { error: subError.message };

  // Create payment
  const { error: payError } = await admin.from("payments").insert({
    player_id: data.player_id,
    subscription_id: subscription.id,
    amount: data.amount,
    method: data.method,
    status: isCash ? "confirmed" : "pending",
    confirmed_at: isCash ? new Date().toISOString() : null,
    confirmed_by: isCash ? user.id : null,
  });

  if (payError) return { error: payError.message };

  revalidatePath("/admin/payments");
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function getScreenshotUrl(path: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data } = await supabase.storage
    .from("payment-screenshots")
    .createSignedUrl(path, 300); // 5 min expiry

  if (!data?.signedUrl) return { error: "Could not generate URL" };
  return { url: data.signedUrl };
}
