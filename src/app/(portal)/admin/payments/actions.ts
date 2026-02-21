"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

export async function getScreenshotUrl(path: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data } = await supabase.storage
    .from("payment-screenshots")
    .createSignedUrl(path, 300); // 5 min expiry

  if (!data?.signedUrl) return { error: "Could not generate URL" };
  return { url: data.signedUrl };
}
