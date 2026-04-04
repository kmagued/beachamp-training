"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import { createNotification, notifyAdmins } from "./notifications";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function createPrivateSessionRequest(data: {
  coach_id?: string;
  requested_day_of_week: number;
  requested_time: string;
  duration_minutes?: number;
  notes?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  if (data.requested_day_of_week < 0 || data.requested_day_of_week > 6) {
    return { error: "Invalid day of week" };
  }

  const { error } = await admin.from("private_session_requests").insert({
    player_id: user.id,
    coach_id: data.coach_id || null,
    requested_day_of_week: data.requested_day_of_week,
    requested_time: data.requested_time,
    duration_minutes: data.duration_minutes || 60,
    notes: data.notes || null,
  });

  if (error) return { error: error.message };

  const playerName = `${user.profile.first_name} ${user.profile.last_name}`;
  const dayName = DAY_NAMES[data.requested_day_of_week];
  await notifyAdmins({
    title: "New Private Session Request",
    body: `${playerName} requested a private session on ${dayName}s at ${data.requested_time}`,
    type: "private_session",
    link: "/admin/private-sessions",
  });

  revalidatePath("/player/private-sessions");
  revalidatePath("/admin/private-sessions");
  return { success: true };
}

export async function cancelPrivateSessionRequest(requestId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("private_session_requests")
    .select("id, player_id, status")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: "Request not found" };
  if (req.player_id !== user.id) return { error: "Not authorized" };
  if (req.status !== "pending") return { error: "Only pending requests can be cancelled" };

  const { error } = await admin
    .from("private_session_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);

  if (error) return { error: error.message };

  revalidatePath("/player/private-sessions");
  revalidatePath("/admin/private-sessions");
  return { success: true };
}

export async function updatePrivateSessionStatus(
  requestId: string,
  status: "confirmed" | "rejected",
  adminNotes?: string
) {
  const user = await getCurrentUser();
  if (!user || user.profile.role !== "admin") return { error: "Not authorized" };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("private_session_requests")
    .select("id, status, player_id, requested_day_of_week")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: "Request not found" };
  if (req.status !== "pending") return { error: "Only pending requests can be updated" };

  const { error } = await admin
    .from("private_session_requests")
    .update({
      status,
      admin_notes: adminNotes || null,
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  const dayName = DAY_NAMES[req.requested_day_of_week];
  await createNotification({
    user_id: req.player_id,
    title: status === "confirmed"
      ? "Private Session Confirmed"
      : "Private Session Rejected",
    body: status === "confirmed"
      ? `Your private session request for ${dayName}s has been confirmed.`
      : `Your private session request for ${dayName}s was rejected.${adminNotes ? ` Reason: ${adminNotes}` : ""}`,
    type: "private_session",
    link: "/player/private-sessions",
  });

  revalidatePath("/player/private-sessions");
  revalidatePath("/admin/private-sessions");
  return { success: true };
}
