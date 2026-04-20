"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { PaymentMethod } from "@/types/database";
import { createNotification, notifyAdmins } from "@/app/_actions/notifications";

/**
 * Compute the start date for a newly-activated subscription, chaining after
 * the player's existing active sub. If the existing sub is depleted (no
 * sessions remaining) before its end_date, the new sub starts the day after
 * the player's last attended session instead of waiting for the expiry date.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeRenewalStartDate(supabase: any, playerId: string, excludeSubId?: string): Promise<Date> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let query = supabase
    .from("subscriptions")
    .select("end_date, sessions_remaining, sessions_total")
    .eq("player_id", playerId)
    .eq("status", "active")
    .order("end_date", { ascending: false, nullsFirst: false })
    .limit(5);
  if (excludeSubId) query = query.neq("id", excludeSubId);
  const { data: existingList } = await query;

  // Skip single-session subs — they're open-ended and shouldn't push the renewal date out
  const existing = (existingList || []).find(
    (s: { sessions_total: number }) => s.sessions_total > 1,
  );

  if (!existing?.end_date) return today;

  const activeEndDate = new Date(existing.end_date);
  if (activeEndDate <= today) return today;

  // Depleted early — chain from last attendance instead of expiry
  if ((existing.sessions_remaining ?? 0) <= 0) {
    const { data: lastAtt } = await supabase
      .from("attendance")
      .select("session_date")
      .eq("player_id", playerId)
      .eq("status", "present")
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastAtt?.session_date) {
      const lastDate = new Date(lastAtt.session_date);
      const nextDay = new Date(lastDate);
      nextDay.setDate(nextDay.getDate() + 1);
      if (nextDay < today) return today;
      if (nextDay > activeEndDate) {
        const chained = new Date(activeEndDate);
        chained.setDate(chained.getDate() + 1);
        return chained;
      }
      return nextDay;
    }
    return today;
  }

  // Not depleted — chain after expiry
  const chained = new Date(activeEndDate);
  chained.setDate(chained.getDate() + 1);
  return chained;
}

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

  // Update payment status
  const { error: payError } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (payError) return { error: payError.message };

  // Activate subscription (only if payment has one)
  if (payment.subscription_id && payment.subscriptions?.packages) {
    const pkg = payment.subscriptions.packages;
    const subStatus = payment.subscriptions.status;

    // For pending_payment subs (auto-created after attendance), keep existing dates
    if (subStatus === "pending_payment") {
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("id", payment.subscription_id);
      if (subError) return { error: subError.message };
    } else {
      const startDate = await computeRenewalStartDate(supabase, payment.player_id, payment.subscription_id);
      const isSingleSession = pkg.session_count === 1;

      const endDateStr = isSingleSession
        ? null
        : (() => {
            const d = new Date(startDate);
            d.setDate(d.getDate() + pkg.validity_days);
            return d.toISOString().split("T")[0];
          })();

      const { error: subError } = await supabase
        .from("subscriptions")
        .update({
          status: "active",
          start_date: startDate.toISOString().split("T")[0],
          end_date: endDateStr,
        })
        .eq("id", payment.subscription_id);

      if (subError) return { error: subError.message };
    }
  }

  // Notify player that payment is confirmed
  if (payment.player_id) {
    await createNotification({
      user_id: payment.player_id,
      title: "Payment Confirmed",
      body: "Your payment has been confirmed and your subscription is now active.",
      type: "payment",
      link: "/player/subscriptions",
    });
  }

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
    .select("subscription_id, status, player_id")
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

  // Cancel subscription (only if payment has one)
  if (payment.subscription_id) {
    const { error: subError } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", payment.subscription_id);

    if (subError) return { error: subError.message };
  }

  // Notify player of rejection
  if (payment.player_id) {
    await createNotification({
      user_id: payment.player_id,
      title: "Payment Rejected",
      body: reason ? `Your payment was rejected: ${reason}` : "Your payment was rejected. Please contact support.",
      type: "payment",
      link: "/player/subscriptions",
    });
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  revalidatePath("/player/subscriptions");
  return { success: true };
}

export async function updatePayment(
  paymentId: string,
  updates: {
    amount?: number;
    method?: string;
    status?: string;
    confirmed_at?: string;
    payment_date?: string;
    package_id?: string;
  },
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
  if (updates.confirmed_at !== undefined) paymentUpdate.confirmed_at = new Date(updates.confirmed_at).toISOString();
  if (updates.payment_date !== undefined) paymentUpdate.confirmed_at = new Date(updates.payment_date).toISOString();

  // Handle package change on the linked subscription
  if (
    updates.package_id !== undefined &&
    payment.subscription_id &&
    payment.subscriptions &&
    updates.package_id !== payment.subscriptions.package_id
  ) {
    const { data: newPkg } = await supabase
      .from("packages")
      .select("id, session_count, validity_days")
      .eq("id", updates.package_id)
      .single();

    if (!newPkg) return { error: "Selected package not found" };

    const oldTotal = payment.subscriptions.sessions_total as number;
    const oldRemaining = payment.subscriptions.sessions_remaining as number;
    const consumed = Math.max(0, oldTotal - oldRemaining);
    const newRemaining = Math.max(0, newPkg.session_count - consumed);

    const subUpdate: Record<string, unknown> = {
      package_id: newPkg.id,
      sessions_total: newPkg.session_count,
      sessions_remaining: newRemaining,
    };

    if (newPkg.session_count === 1) {
      subUpdate.end_date = null;
    } else if (payment.subscriptions.start_date) {
      const startDate = new Date(payment.subscriptions.start_date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + newPkg.validity_days);
      subUpdate.end_date = endDate.toISOString().split("T")[0];
    }

    const { error: subErr } = await supabase
      .from("subscriptions")
      .update(subUpdate)
      .eq("id", payment.subscription_id);
    if (subErr) return { error: subErr.message };
  }

  // Handle status change
  if (updates.status && updates.status !== payment.status) {
    paymentUpdate.status = updates.status;

    if (updates.status === "confirmed") {
      paymentUpdate.confirmed_by = user.id;
      paymentUpdate.confirmed_at = new Date().toISOString();
      paymentUpdate.rejection_reason = null;

      // Activate subscription with proper dates (only if payment has one)
      if (payment.subscription_id) {
        const pkg = payment.subscriptions?.packages;
        const subStatus = payment.subscriptions?.status;
        if (pkg) {
          // For pending_payment subs (auto-created after attendance), keep existing dates
          if (subStatus === "pending_payment") {
            await supabase
              .from("subscriptions")
              .update({ status: "active" })
              .eq("id", payment.subscription_id);
          } else {
            const startDate = await computeRenewalStartDate(supabase, payment.player_id, payment.subscription_id);
            const isSingleSession = pkg.session_count === 1;
            const endDateStr = isSingleSession
              ? null
              : (() => {
                  const d = new Date(startDate);
                  d.setDate(d.getDate() + pkg.validity_days);
                  return d.toISOString().split("T")[0];
                })();

            await supabase
              .from("subscriptions")
              .update({
                status: "active",
                start_date: startDate.toISOString().split("T")[0],
                end_date: endDateStr,
              })
              .eq("id", payment.subscription_id);
          }
        }
      }
    } else if (updates.status === "pending") {
      paymentUpdate.confirmed_by = null;
      paymentUpdate.confirmed_at = null;
      paymentUpdate.rejection_reason = null;

      if (payment.subscription_id) {
        await supabase
          .from("subscriptions")
          .update({ status: "pending", start_date: null, end_date: null })
          .eq("id", payment.subscription_id);
      }
    } else if (updates.status === "rejected") {
      paymentUpdate.confirmed_by = null;
      paymentUpdate.confirmed_at = null;

      if (payment.subscription_id) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("id", payment.subscription_id);
      }
    }
  }

  const packageChanged =
    updates.package_id !== undefined &&
    payment.subscriptions &&
    updates.package_id !== payment.subscriptions.package_id;

  if (Object.keys(paymentUpdate).length === 0 && !packageChanged) {
    return { error: "No changes provided" };
  }

  if (Object.keys(paymentUpdate).length > 0) {
    const { error } = await supabase
      .from("payments")
      .update(paymentUpdate)
      .eq("id", paymentId);
    if (error) return { error: error.message };
  }

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
  payment_date?: string;
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

  // Use provided date or smart start_date
  let startDate: Date;

  if (data.payment_date) {
    startDate = new Date(data.payment_date);
  } else {
    startDate = await computeRenewalStartDate(admin, data.player_id);
  }

  const isSingleSession = pkg.session_count === 1;
  const endDateStr = isSingleSession
    ? null
    : (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + pkg.validity_days);
        return d.toISOString().split("T")[0];
      })();

  const isCash = data.method === "cash";

  // If the player already has an unsettled pending_payment subscription for
  // this same package (auto-created when they attended without an active sub),
  // settle that one instead of creating a duplicate. Otherwise sessions_total
  // for the new sub would be added on top of the already-deducted unpaid sessions.
  const { data: existingPending } = await admin
    .from("subscriptions")
    .select("id")
    .eq("player_id", data.player_id)
    .eq("package_id", data.package_id)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let subscriptionId: string;
  if (existingPending) {
    const { error: subError } = await admin
      .from("subscriptions")
      .update({
        status: isCash ? "active" : "pending",
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDateStr,
      })
      .eq("id", existingPending.id);
    if (subError) return { error: subError.message };
    subscriptionId = existingPending.id;
  } else {
    const { data: subscription, error: subError } = await admin
      .from("subscriptions")
      .insert({
        player_id: data.player_id,
        package_id: data.package_id,
        sessions_remaining: pkg.session_count,
        sessions_total: pkg.session_count,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDateStr,
        status: isCash ? "active" : "pending",
      })
      .select("id")
      .single();

    if (subError) return { error: subError.message };
    subscriptionId = subscription.id;
  }

  // Create payment
  const { error: payError } = await admin.from("payments").insert({
    player_id: data.player_id,
    subscription_id: subscriptionId,
    amount: data.amount,
    method: data.method,
    status: isCash ? "confirmed" : "pending",
    confirmed_at: isCash ? (data.payment_date ? new Date(data.payment_date).toISOString() : new Date().toISOString()) : null,
    confirmed_by: isCash ? user.id : null,
  });

  if (payError) return { error: payError.message };

  revalidatePath("/admin/payments");
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function createStandalonePayment(data: {
  package_id: string;
  amount: number;
  method: PaymentMethod;
  note: string;
  payment_date?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return { error: "Unauthorized" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Get package details
  const { data: pkg, error: pkgError } = await admin
    .from("packages")
    .select("id, session_count, validity_days")
    .eq("id", data.package_id)
    .single();

  if (pkgError || !pkg) return { error: "Package not found" };

  const startDate = data.payment_date ? new Date(data.payment_date) : new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + pkg.validity_days);

  // Create subscription (no player) — always active for standalone
  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .insert({
      player_id: null,
      package_id: data.package_id,
      sessions_remaining: pkg.session_count,
      sessions_total: pkg.session_count,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      status: "active",
    })
    .select("id")
    .single();

  if (subError) return { error: subError.message };

  // Create payment — always confirmed for standalone
  const confirmedAt = data.payment_date ? new Date(data.payment_date).toISOString() : new Date().toISOString();
  const { error } = await admin.from("payments").insert({
    player_id: null,
    subscription_id: subscription.id,
    amount: data.amount,
    method: data.method,
    note: data.note,
    status: "confirmed",
    confirmed_at: confirmedAt,
    confirmed_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/payments");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function bulkDeletePayments(paymentIds: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return { error: "Unauthorized" };

  const results = { success: 0, failed: 0 };

  for (const id of paymentIds) {
    const res = await deletePayment(id);
    if ("error" in res) results.failed++;
    else results.success++;
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true, results };
}

export async function linkPaymentToPlayer(paymentId: string, playerId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, player_id, subscription_id")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };
  if (payment.player_id) return { error: "Payment is already linked to a player" };

  const { error: payError } = await supabase
    .from("payments")
    .update({ player_id: playerId })
    .eq("id", paymentId);

  if (payError) return { error: payError.message };

  if (payment.subscription_id) {
    const { error: subError } = await supabase
      .from("subscriptions")
      .update({ player_id: playerId })
      .eq("id", payment.subscription_id);

    if (subError) return { error: subError.message };
  }

  revalidatePath("/admin/payments");
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function deletePayment(paymentId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return { error: "Unauthorized" };

  // Fetch payment to check for linked subscription
  const { data: payment } = await supabase
    .from("payments")
    .select("id, subscription_id")
    .eq("id", paymentId)
    .single();

  if (!payment) return { error: "Payment not found" };

  // Delete associated subscription first (if any)
  if (payment.subscription_id) {
    const { error: subError } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", payment.subscription_id);
    if (subError) return { error: subError.message };
  }

  // Delete the payment
  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", paymentId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payments");
  revalidatePath("/admin/players");
  revalidatePath("/admin/dashboard");
  revalidatePath("/player/subscriptions");
  revalidatePath("/player/dashboard");
  return { success: true };
}

export async function createPendingPaymentForSession(data: {
  player_id: string;
  package_id: string;
  amount: number;
  session_date: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: pkg, error: pkgError } = await admin
    .from("packages")
    .select("id, session_count, validity_days")
    .eq("id", data.package_id)
    .single();

  if (pkgError || !pkg) return { error: "Package not found" };

  // Parse date parts to avoid timezone shift
  const [y, m, d] = data.session_date.split("-").map(Number);
  const startDate = new Date(y, m - 1, d);
  const endDate = new Date(y, m - 1, d + pkg.validity_days);

  const startStr = data.session_date;
  const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  // Create pending subscription (subtract 1 for the session already attended)
  const { data: subscription, error: subError } = await admin
    .from("subscriptions")
    .insert({
      player_id: data.player_id,
      package_id: data.package_id,
      sessions_remaining: Math.max(pkg.session_count - 1, 0),
      sessions_total: pkg.session_count,
      start_date: startStr,
      end_date: endStr,
      status: "pending_payment",
    })
    .select("id")
    .single();

  if (subError) return { error: subError.message };

  // Create pending payment
  const { error: payError } = await admin.from("payments").insert({
    player_id: data.player_id,
    subscription_id: subscription.id,
    amount: data.amount,
    method: "cash",
    status: "pending",
  });

  if (payError) return { error: payError.message };

  return { success: true, player_id: data.player_id };
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
