"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import { createNotification, notifyAdmins } from "./notifications";
import {
  ClashApiError,
  cancelClashReservation,
  createClashReservation,
  isClashConfigured,
  toCairoIso,
} from "@/lib/clash/client";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

/**
 * Reserve a Clash court for a freshly-created private session.
 *
 * On success, stamps the session row with clash_reservation_id (and mirrors
 * the court name into `location` for display continuity).
 * On failure, soft-deletes the session row (is_active=false) so the partial
 * booking doesn't show up on the schedule, and returns the error message.
 */
async function reserveClashCourtForSession(
  admin: SupabaseAdmin,
  scheduleSessionId: string,
  params: {
    clashCourtId: string;
    clashCourtName: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    primaryPlayerId: string;
    notes?: string;
  }
): Promise<{ success: true } | { error: string }> {
  // Pull the booking guest info from the primary player's profile.
  const { data: player } = await admin
    .from("profiles")
    .select("first_name, last_name, email, phone")
    .eq("id", params.primaryPlayerId)
    .single();

  const guestName = player
    ? `${player.first_name || ""} ${player.last_name || ""}`.trim() || "Beachamp Player"
    : "Beachamp Player";
  const guestEmail = player?.email || "noreply@beachamp.org";
  const guestPhone = player?.phone || "+200000000000";

  const endTimeForClash = params.endTime === "00:00" ? "24:00" : params.endTime;

  try {
    const reservation = await createClashReservation({
      courtId: params.clashCourtId,
      startTime: toCairoIso(params.sessionDate, params.startTime),
      endTime: toCairoIso(params.sessionDate, endTimeForClash),
      guestName,
      guestEmail,
      guestPhone,
      externalPaymentReference: `beachamp:session:${scheduleSessionId}`,
      notes: params.notes,
    });

    await admin
      .from("schedule_sessions")
      .update({
        clash_reservation_id: reservation.id,
        clash_court_id: params.clashCourtId,
        clash_court_name: params.clashCourtName,
        location: params.clashCourtName,
      })
      .eq("id", scheduleSessionId);

    return { success: true };
  } catch (err) {
    const message =
      err instanceof ClashApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to reserve court on The Clash";

    // Roll back the local session so the schedule doesn't show a phantom booking.
    await admin
      .from("schedule_sessions")
      .update({ is_active: false })
      .eq("id", scheduleSessionId);

    return { error: `Court reservation failed: ${message}` };
  }
}

export async function createPrivateSessionRequest(data: {
  coach_id?: string;
  requested_day_of_week: number;
  requested_date?: string;
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
    requested_date: data.requested_date || null,
    requested_time: data.requested_time,
    duration_minutes: data.duration_minutes || 60,
    notes: data.notes || null,
  });

  if (error) return { error: error.message };

  const playerName = `${user.profile.first_name} ${user.profile.last_name}`;
  const dayName = DAY_NAMES[data.requested_day_of_week];
  const whenLabel = data.requested_date
    ? `${data.requested_date} at ${data.requested_time}`
    : `${dayName}s at ${data.requested_time}`;
  await notifyAdmins({
    title: "New Private Session Request",
    body: `${playerName} requested a private session on ${whenLabel}`,
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

function addMinutesToTime(start: string, minutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function confirmPrivateSessionRequest(
  requestId: string,
  sessionDate: string,
  opts?: {
    location?: string;
    coachId?: string;
    clashCourtId?: string;
    clashCourtName?: string;
  }
) {
  const user = await getCurrentUser();
  if (!user || user.profile.role !== "admin") return { error: "Not authorized" };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from("private_session_requests")
    .select("id, status, player_id, coach_id, requested_day_of_week, requested_time, duration_minutes, location")
    .eq("id", requestId)
    .single();

  if (fetchErr || !req) return { error: "Request not found" };
  if (req.status !== "pending") return { error: "Only pending requests can be updated" };
  if (!sessionDate) return { error: "A date is required" };

  const dow = new Date(sessionDate + "T00:00:00").getDay();
  if (dow !== req.requested_day_of_week) {
    return { error: "Selected date does not match the requested day of week" };
  }

  const duration = req.duration_minutes || 60;
  const startTime = (req.requested_time as string).slice(0, 5);
  const endTime = addMinutesToTime(startTime, duration);
  const coachId = opts?.coachId || req.coach_id || null;
  const clashCourtId = opts?.clashCourtId || null;
  const clashCourtName = opts?.clashCourtName || null;
  const location = clashCourtName ?? opts?.location ?? req.location ?? null;

  const { data: created, error: insertErr } = await admin
    .from("schedule_sessions")
    .insert({
      session_type: "private",
      group_id: null,
      player_id: req.player_id,
      coach_id: coachId,
      day_of_week: dow,
      start_time: startTime,
      end_time: endTime,
      location,
      end_date: sessionDate,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertErr || !created) return { error: insertErr?.message || "Failed to create session" };

  // Player-requested sessions are always single-player
  await admin.from("schedule_session_players").insert({
    schedule_session_id: created.id,
    player_id: req.player_id,
  });

  if (clashCourtId && clashCourtName && isClashConfigured()) {
    const reserveRes = await reserveClashCourtForSession(admin, created.id, {
      clashCourtId,
      clashCourtName,
      sessionDate,
      startTime,
      endTime,
      primaryPlayerId: req.player_id,
      notes: "Private session (Beachamp Academy)",
    });
    if ("error" in reserveRes) return { error: reserveRes.error };
  }

  const { error: updateErr } = await admin
    .from("private_session_requests")
    .update({
      status: "confirmed",
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
      schedule_session_id: created.id,
    })
    .eq("id", requestId);

  if (updateErr) return { error: updateErr.message };

  const dayName = DAY_NAMES[req.requested_day_of_week];
  await createNotification({
    user_id: req.player_id,
    title: "Private Session Confirmed",
    body: `Your private session has been scheduled for ${dayName} ${sessionDate} at ${startTime}.`,
    type: "private_session",
    link: "/player/private-sessions",
  });

  revalidatePath("/player/private-sessions");
  revalidatePath("/admin/private-sessions");
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  revalidatePath("/admin/daily-report");
  return { success: true };
}

export async function rejectPrivateSessionRequest(
  requestId: string,
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
      status: "rejected",
      admin_notes: adminNotes || null,
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) return { error: error.message };

  const dayName = DAY_NAMES[req.requested_day_of_week];
  await createNotification({
    user_id: req.player_id,
    title: "Private Session Rejected",
    body: `Your private session request for ${dayName}s was rejected.${adminNotes ? ` Reason: ${adminNotes}` : ""}`,
    type: "private_session",
    link: "/player/private-sessions",
  });

  revalidatePath("/player/private-sessions");
  revalidatePath("/admin/private-sessions");
  return { success: true };
}

export async function deletePrivateScheduleSession(scheduleSessionId: string) {
  const user = await getCurrentUser();
  if (!user || user.profile.role !== "admin") return { error: "Not authorized" };

  const admin = createAdminClient();

  const { data: session, error: fetchErr } = await admin
    .from("schedule_sessions")
    .select("id, session_type, clash_reservation_id")
    .eq("id", scheduleSessionId)
    .single();

  if (fetchErr || !session) return { error: "Session not found" };
  if (session.session_type !== "private") return { error: "Not a private session" };

  const { error } = await admin
    .from("schedule_sessions")
    .update({ is_active: false })
    .eq("id", scheduleSessionId);

  if (error) return { error: error.message };

  // Best-effort: release the Clash court so it frees up immediately.
  // We don't fail the local cancellation if Clash is down — the academy
  // still wants the session off its own schedule.
  if (session.clash_reservation_id && isClashConfigured()) {
    try {
      await cancelClashReservation(session.clash_reservation_id);
    } catch (err) {
      console.error("[clash] Failed to cancel reservation", session.clash_reservation_id, err);
    }
  }

  // Unlink any request that pointed at this session
  await admin
    .from("private_session_requests")
    .update({ schedule_session_id: null })
    .eq("schedule_session_id", scheduleSessionId);

  revalidatePath("/admin/private-sessions");
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  revalidatePath("/admin/daily-report");
  return { success: true };
}

export async function createAdminPrivateSession(data: {
  player_ids: string[];
  session_date: string;
  start_time: string;
  end_time: string;
  coach_id?: string | null;
  location?: string | null;
  clash_court_id?: string | null;
  clash_court_name?: string | null;
}) {
  const user = await getCurrentUser();
  if (!user || user.profile.role !== "admin") return { error: "Not authorized" };

  const playerIds = [...new Set(data.player_ids.filter(Boolean))];
  if (playerIds.length === 0) return { error: "At least one player is required" };
  if (!data.session_date) return { error: "A date is required" };
  if (!data.start_time || !data.end_time) return { error: "Start and end times are required" };

  const start = data.start_time.slice(0, 5);
  const end = data.end_time.slice(0, 5);
  const effectiveEnd = end === "00:00" ? "24:00" : end;
  if (effectiveEnd <= start) return { error: "End time must be after start time" };

  const dow = new Date(data.session_date + "T00:00:00").getDay();

  // When a Clash court is selected, mirror its name into the location text
  // so the existing schedule UI keeps showing a sensible label.
  const location = data.clash_court_name || data.location || null;

  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("schedule_sessions")
    .insert({
      session_type: "private",
      group_id: null,
      // Keep the first player on the session for back-compat; join table is source of truth
      player_id: playerIds[0],
      coach_id: data.coach_id || null,
      day_of_week: dow,
      start_time: start,
      end_time: end,
      location,
      end_date: data.session_date,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !created) return { error: error?.message || "Failed to create session" };

  const { error: linkErr } = await admin.from("schedule_session_players").insert(
    playerIds.map((pid) => ({ schedule_session_id: created.id, player_id: pid }))
  );
  if (linkErr) return { error: linkErr.message };

  if (data.clash_court_id && data.clash_court_name && isClashConfigured()) {
    const reserveRes = await reserveClashCourtForSession(admin, created.id, {
      clashCourtId: data.clash_court_id,
      clashCourtName: data.clash_court_name,
      sessionDate: data.session_date,
      startTime: start,
      endTime: end,
      primaryPlayerId: playerIds[0],
      notes: "Private session (Beachamp Academy)",
    });
    if ("error" in reserveRes) return { error: reserveRes.error };
  }

  for (const pid of playerIds) {
    await createNotification({
      user_id: pid,
      title: "Private Session Scheduled",
      body: `A private session has been scheduled for ${data.session_date} at ${start}.`,
      type: "private_session",
      link: "/player/private-sessions",
    });
  }

  revalidatePath("/admin/private-sessions");
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  revalidatePath("/admin/daily-report");
  return { success: true, id: created.id };
}
