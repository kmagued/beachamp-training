"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";

/**
 * Player uploads an Instapay screenshot for an existing unpaid (pending_payment)
 * session. Attaches the proof to the already-created payment row and flips its
 * method to instapay — leaving the subscription as pending_payment so admin
 * confirmation keeps the original session dates (confirmPayment handles that).
 */
export async function submitPendingPaymentScreenshot(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const paymentId = (formData.get("payment_id") as string) || "";
  const screenshot = formData.get("screenshot") as File | null;

  if (!paymentId) return { error: "Missing payment reference" };
  if (!screenshot || screenshot.size === 0) return { error: "Please attach your payment screenshot" };
  if (!["image/png", "image/jpeg"].includes(screenshot.type)) {
    return { error: "Screenshot must be a PNG or JPG image" };
  }
  if (screenshot.size > 5 * 1024 * 1024) return { error: "Screenshot must be under 5MB" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // The payment must be this player's, still pending, and tied to an unpaid sub.
  const { data: payment } = await admin
    .from("payments")
    .select("id, player_id, status, subscriptions(status)")
    .eq("id", paymentId)
    .single();

  if (!payment || payment.player_id !== user.id) return { error: "Payment not found" };
  if (payment.status !== "pending" || payment.subscriptions?.status !== "pending_payment") {
    return { error: "This payment can no longer be updated" };
  }

  // Upload proof into the player's own folder (so player + admins can view it).
  // The {user.id}/ prefix fixes the RLS folder; sanitize the rest for a tidy key.
  const safeName = screenshot.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${Date.now()}_${safeName}`;
  const { error: uploadError } = await admin.storage
    .from("payment-screenshots")
    .upload(path, screenshot, { contentType: screenshot.type });
  if (uploadError) return { error: "Failed to upload screenshot. Please try again." };

  // Guard on status so a concurrent admin confirm/reject isn't overwritten.
  const { error: updateError } = await admin
    .from("payments")
    .update({ screenshot_url: path, method: "instapay" })
    .eq("id", paymentId)
    .eq("status", "pending");
  if (updateError) {
    // Don't strand an orphaned file if attaching it to the payment failed.
    await admin.storage.from("payment-screenshots").remove([path]);
    return { error: "Failed to save your payment proof. Please try again." };
  }

  revalidatePath("/player/dashboard");
  revalidatePath("/admin/payments");
  return { success: true };
}
