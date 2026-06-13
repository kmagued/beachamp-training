"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { revalidatePath } from "next/cache";
import { createNotification, notifyAdmins } from "./notifications";
import { isCoachBlocked } from "@/lib/scheduling/coach-availability";
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

// ---------------------------------------------------------------------------
// Availability for the player-facing request form.
//
// The request form must reflect coach blocks and OTHER players' pending/confirmed
// requests — but RLS hides both from a player's browser client (players can only
// read their own requests, and cannot read coach_blocks at all). So availability
// is computed here, server-side, with the service-role admin client, and only
// busy *intervals* are returned to the client (no reasons/identities leaked).
// ---------------------------------------------------------------------------

type BusyInterval = {
  start_time: string;
  end_time: string;
  kind: "group" | "private" | "block";
  reason?: string | null;
};

function hhmmToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToHHMM(total: number): string {
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dowOfDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * All busy intervals on `date` that occupy `coachId`'s calendar: recurring
 * sessions (minus cancellations), pending/confirmed private requests, and the
 * coach's unavailability blocks. When `includeUnassigned` is true (single-coach
 * academy), sessions/requests with no coach attribution count too, since they
 * can only run with the sole coach.
 */
async function coachBusyIntervals(
  admin: SupabaseAdmin,
  coachId: string,
  date: string,
  includeUnassigned: boolean
): Promise<BusyInterval[]> {
  const dow = dowOfDate(date);
  const intervals: BusyInterval[] = [];

  // Recurring schedule sessions on this weekday, still in range, minus cancellations.
  let sessionQuery = admin
    .from("schedule_sessions")
    .select("id, start_time, end_time, session_type, end_date")
    .eq("is_active", true)
    .eq("day_of_week", dow)
    .or(`end_date.is.null,end_date.gte.${date}`);
  sessionQuery = includeUnassigned
    ? sessionQuery.or(`coach_id.eq.${coachId},coach_id.is.null`)
    : sessionQuery.eq("coach_id", coachId);
  const { data: sessions } = await sessionQuery;

  const sessionIds = (sessions || []).map((s: { id: string }) => s.id);
  const cancelled = new Set<string>();
  if (sessionIds.length > 0) {
    const { data: cancels } = await admin
      .from("schedule_session_cancellations")
      .select("schedule_session_id")
      .in("schedule_session_id", sessionIds)
      .eq("cancelled_date", date);
    for (const c of cancels || []) cancelled.add(c.schedule_session_id as string);
  }
  for (const s of (sessions || []) as Array<{
    id: string;
    start_time: string;
    end_time: string;
    session_type: string;
    end_date: string | null;
  }>) {
    if (cancelled.has(s.id)) continue;
    // A private one-off session occupies ONLY its exact date — end_date is the
    // occurrence date, not an expiry. Without this, a future private session
    // would falsely block the same weekday + time on every earlier date.
    if (s.session_type === "private" && s.end_date !== date) continue;
    intervals.push({
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      kind: s.session_type === "private" ? "private" : "group",
    });
  }

  // Pending/confirmed private requests occupying this coach's calendar.
  let reqQuery = admin
    .from("private_session_requests")
    .select("requested_time, duration_minutes")
    .in("status", ["pending", "confirmed"])
    .or(`requested_date.eq.${date},and(requested_date.is.null,requested_day_of_week.eq.${dow})`);
  reqQuery = includeUnassigned
    ? reqQuery.or(`coach_id.eq.${coachId},coach_id.is.null`)
    : reqQuery.eq("coach_id", coachId);
  const { data: requests } = await reqQuery;
  for (const r of (requests || []) as Array<{ requested_time: string; duration_minutes: number | null }>) {
    const start = r.requested_time.slice(0, 5);
    intervals.push({
      start_time: start,
      end_time: minutesToHHMM(hhmmToMinutes(start) + (r.duration_minutes || 60)),
      kind: "private",
    });
  }

  // Coach unavailability blocks applying to this date.
  const { data: blocks } = await admin
    .from("coach_blocks")
    .select("start_time, end_time, reason")
    .eq("coach_id", coachId)
    .or(
      `and(kind.eq.one_time,start_date.lte.${date},or(end_date.is.null,end_date.gte.${date})),` +
        `and(kind.eq.weekly,day_of_week.eq.${dow},or(effective_from.is.null,effective_from.lte.${date}),or(effective_until.is.null,effective_until.gte.${date}))`
    );
  for (const b of (blocks || []) as Array<{ start_time: string | null; end_time: string | null; reason: string | null }>) {
    const allDay = b.start_time === null && b.end_time === null;
    // A half-specified block (exactly one bound null) is never created, and the
    // canonical matcher (blockMatchesSync) ignores it — so do the same here.
    if (!allDay && (b.start_time === null || b.end_time === null)) continue;
    intervals.push({
      start_time: allDay ? "00:00" : (b.start_time as string).slice(0, 5),
      end_time: allDay ? "24:00" : (b.end_time as string).slice(0, 5),
      kind: "block",
      reason: b.reason,
    });
  }

  return intervals;
}

/**
 * Resolve the busy set for a request. A specific coach uses that coach's
 * calendar. With no coach ("any available coach"): a single-coach academy
 * resolves to the sole coach; with multiple coaches we can't determine a single
 * calendar here, so we signal needsCoach so the UI asks the player to choose one.
 */
async function resolveBusyIntervals(
  admin: SupabaseAdmin,
  date: string,
  coachId?: string
): Promise<{ busy: BusyInterval[]; needsCoach: boolean }> {
  const { data: activeCoaches } = await admin
    .from("profiles")
    .select("id")
    .eq("is_coach", true)
    .eq("is_active", true);
  const coachIds = (activeCoaches || []).map((c: { id: string }) => c.id as string);

  if (coachId) {
    const sole = coachIds.length === 1 && coachIds[0] === coachId;
    return { busy: await coachBusyIntervals(admin, coachId, date, sole), needsCoach: false };
  }
  if (coachIds.length === 1) {
    return { busy: await coachBusyIntervals(admin, coachIds[0], date, true), needsCoach: false };
  }
  return { busy: [], needsCoach: coachIds.length > 1 };
}

export async function getPrivateSessionAvailability(input: {
  date: string;
  coachId?: string;
}): Promise<{ busy: BusyInterval[]; needsCoach: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { busy: [], needsCoach: false };

  const admin = createAdminClient();
  const { busy, needsCoach } = await resolveBusyIntervals(admin, input.date, input.coachId || undefined);
  // Only expose the busy window + kind — never the coach's private block reason.
  return {
    busy: busy.map((b) => ({ start_time: b.start_time, end_time: b.end_time, kind: b.kind })),
    needsCoach,
  };
}

export async function createPrivateSessionRequest(data: {
  coach_id?: string;
  requested_day_of_week: number;
  requested_date?: string;
  requested_time: string;
  duration_minutes?: number;
  notes?: string;
  partner_player_id?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();

  if (data.requested_day_of_week < 0 || data.requested_day_of_week > 6) {
    return { error: "Invalid day of week" };
  }

  // Defense in depth: never trust the client's slot pick. Re-check the full
  // requested window against the coach's real availability (blocks + sessions +
  // other players' requests), which RLS hides from the player's own browser.
  if (data.requested_date) {
    const startM = hhmmToMinutes(data.requested_time);
    const endM = startM + (data.duration_minutes || 60);
    const { busy, needsCoach } = await resolveBusyIntervals(admin, data.requested_date, data.coach_id || undefined);
    if (needsCoach) {
      return { error: "Please choose a specific coach for this session." };
    }
    const clash = busy.find(
      (b) => hhmmToMinutes(b.start_time) < endM && hhmmToMinutes(b.end_time) > startM
    );
    if (clash) {
      return {
        error:
          clash.kind === "block"
            ? "The coach is unavailable at that time. Please pick another slot."
            : "That time has just been booked. Please pick another slot.",
      };
    }
  }

  let partnerPlayerId: string | null = null;
  if (data.partner_player_id) {
    if (data.partner_player_id === user.id) {
      return { error: "You cannot select yourself as the second player." };
    }
    const { data: partner } = await admin
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", data.partner_player_id)
      .single();
    if (!partner || partner.role !== "player" || !partner.is_active) {
      return { error: "Selected second player is not available." };
    }
    partnerPlayerId = partner.id;
  }

  const { error } = await admin.from("private_session_requests").insert({
    player_id: user.id,
    coach_id: data.coach_id || null,
    requested_day_of_week: data.requested_day_of_week,
    requested_date: data.requested_date || null,
    requested_time: data.requested_time,
    duration_minutes: data.duration_minutes || 60,
    notes: data.notes || null,
    partner_player_id: partnerPlayerId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  if (error) return { error: error.message };

  const playerName = `${user.profile.first_name} ${user.profile.last_name}`;
  const dayName = DAY_NAMES[data.requested_day_of_week];
  const whenLabel = data.requested_date
    ? `${data.requested_date} at ${data.requested_time}`
    : `${dayName}s at ${data.requested_time}`;
  await notifyAdmins({
    title: "New Private Session Request",
    body: `${playerName} requested a private session${partnerPlayerId ? " (team training, 2 players)" : ""} on ${whenLabel}`,
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

  const { data: req, error: fetchErr } = await (admin as unknown as SupabaseAdmin)
    .from("private_session_requests")
    .select("id, status, player_id, partner_player_id, coach_id, requested_day_of_week, requested_time, duration_minutes, location")
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

  // Server-side block check (defense in depth)
  if (coachId) {
    const { blocked, matchingBlock } = await isCoachBlocked(coachId, sessionDate, startTime, endTime);
    if (blocked) {
      return {
        error: `Coach is blocked at this time${matchingBlock?.reason ? ` (${matchingBlock.reason})` : ''}. Pick a different time or remove the block first.`,
      };
    }
  }

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

  // Requester is always added; team-training requests also add the partner.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partnerPlayerId = (req as any).partner_player_id as string | null;
  const junctionRows = [{ schedule_session_id: created.id, player_id: req.player_id }];
  if (partnerPlayerId) {
    junctionRows.push({ schedule_session_id: created.id, player_id: partnerPlayerId });
  }
  await admin.from("schedule_session_players").insert(junctionRows);

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

  if (partnerPlayerId) {
    await createNotification({
      user_id: partnerPlayerId,
      title: "Added to a Private Session",
      body: `You've been added to a private team training on ${dayName} ${sessionDate} at ${startTime}.`,
      type: "private_session",
      link: "/player/private-sessions",
    });
  }

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

  // Server-side block check (defense in depth)
  if (data.coach_id) {
    const { blocked, matchingBlock } = await isCoachBlocked(data.coach_id, data.session_date, start, end);
    if (blocked) {
      return {
        error: `Coach is blocked at this time${matchingBlock?.reason ? ` (${matchingBlock.reason})` : ''}. Pick a different time or remove the block first.`,
      };
    }
  }

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

// Search registered players to pick a 2nd player for team training.
// Runs admin-side because RLS hides other players from a player's session.
export async function searchPlayersForPartner(query: string): Promise<{ id: string; name: string }[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  // Strip PostgREST-special chars so the .or() filter can't be manipulated.
  const safe = (query || "").replace(/[%,()]/g, " ").trim();
  if (safe.length < 2) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("role", "player")
    .eq("is_active", true)
    .neq("id", user.id)
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`)
    .order("first_name")
    .limit(20);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) || []).map((p) => ({
    id: p.id as string,
    name: `${p.first_name} ${p.last_name}`,
  }));
}
