"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import type { NotificationType } from "@/types/database";

// JS-side helpers always send the email directly so admins receive mail
// without depending on the optional DB webhook trigger setup. DB-triggered
// notifications (subscription expiring, etc.) still go through trg_notification_email.

function buildCtaUrl(link: string | null | undefined): string | undefined {
  if (!link) return undefined;
  if (/^https?:\/\//i.test(link)) return link;
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  if (!base) return undefined;
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

async function emailUser(userId: string, title: string, body: string | null, link: string | null | undefined) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();
  if (!profile?.email) return;
  const ctaUrl = buildCtaUrl(link);
  await sendEmail({
    to: profile.email,
    subject: title,
    body: body || title,
    ctaLabel: ctaUrl ? "Open in Beachamp" : undefined,
    ctaUrl,
  });
}

/** Create a notification for a specific user. */
export async function createNotification(data: {
  user_id: string;
  title: string;
  body?: string;
  type?: NotificationType;
  link?: string;
}) {
  const admin = createAdminClient();

  const { error } = await admin.from("notifications").insert({
    user_id: data.user_id,
    title: data.title,
    body: data.body || null,
    type: data.type || "system",
    link: data.link || null,
  });
  if (error) return { error: error.message };

  // Fire-and-forget email so the action stays responsive
  emailUser(data.user_id, data.title, data.body || null, data.link || null).catch((err) =>
    console.error("[notifications] email send failed:", err),
  );

  return { success: true };
}

/** Create notifications for all admins. */
export async function notifyAdmins(data: {
  title: string;
  body?: string;
  type?: NotificationType;
  link?: string;
}) {
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "admin")
    .eq("is_active", true);

  if (!admins?.length) return { success: true };

  const rows = admins.map((a: { id: string }) => ({
    user_id: a.id,
    title: data.title,
    body: data.body || null,
    type: data.type || "system" as NotificationType,
    link: data.link || null,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) return { error: error.message };

  // Fire-and-forget emails to every admin with an address on file
  const ctaUrl = buildCtaUrl(data.link || null);
  for (const a of admins as { id: string; email: string | null }[]) {
    if (!a.email) continue;
    sendEmail({
      to: a.email,
      subject: data.title,
      body: data.body || data.title,
      ctaLabel: ctaUrl ? "Open in Beachamp" : undefined,
      ctaUrl,
    }).catch((err) => console.error("[notifications] admin email send failed:", err));
  }

  return { success: true };
}

/** Mark a notification as read */
export async function markNotificationRead(notificationId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/player/notifications");
  revalidatePath("/admin/notifications");
  return { success: true };
}

/** Mark all notifications as read for current user */
export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) return { error: error.message };
  revalidatePath("/player/notifications");
  revalidatePath("/admin/notifications");
  return { success: true };
}
