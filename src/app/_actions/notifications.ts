"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import type { NotificationType } from "@/types/database";

/** Create a notification for a specific user + send email */
export async function createNotification(data: {
  user_id: string;
  title: string;
  body?: string;
  type?: NotificationType;
  link?: string;
}) {
  const admin = createAdminClient();

  // Insert in-app notification
  const { error } = await admin.from("notifications").insert({
    user_id: data.user_id,
    title: data.title,
    body: data.body || null,
    type: data.type || "system",
    link: data.link || null,
  });
  if (error) return { error: error.message };

  // Send email (non-blocking)
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", data.user_id)
    .single();

  if (profile?.email) {
    sendEmail({
      to: profile.email,
      subject: data.title,
      body: data.body || data.title,
    }).catch(() => {}); // fire-and-forget
  }

  return { success: true };
}

/** Create notifications for all admins + send emails */
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

  // Insert in-app notifications
  const rows = admins.map((a: { id: string; email: string | null }) => ({
    user_id: a.id,
    title: data.title,
    body: data.body || null,
    type: data.type || "system" as NotificationType,
    link: data.link || null,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) return { error: error.message };

  // Send emails (non-blocking, parallel)
  const emails = admins
    .filter((a: { email: string | null }) => a.email)
    .map((a: { email: string | null }) =>
      sendEmail({
        to: a.email!,
        subject: data.title,
        body: data.body || data.title,
      }).catch(() => {})
    );
  Promise.all(emails).catch(() => {});

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
