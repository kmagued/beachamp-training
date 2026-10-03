"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { closedMonthScoreBlock } from "@/lib/king-of-court/lock";
import { isFutureCairoDate } from "@/lib/utils/cairo-time";
import { accountOf, coachOrAdmin } from "@/lib/auth/portals";
import { canEditGroupSchedule, sessionCoachId, type ScheduleEditor } from "@/lib/scheduling/edit-access";

// ── Helper: get current user role ──
async function getCurrentUserRole() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_coach")
    .eq("id", user.id)
    .single();

  return profile ? { id: profile.id, role: profile.role as string, is_coach: profile.is_coach === true } : null;
}

function requireAdmin(user: { role: string } | null) {
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized: admin access required" };
  }
  return null;
}

/** The caller as a schedule editor: an admin, or a coach with the groups they're the active
 *  primary coach of. Null for anyone else. */
async function getScheduleEditor(): Promise<ScheduleEditor | null> {
  const user = await getCurrentUserRole();
  if (!user || !coachOrAdmin(accountOf(user))) return null;
  if (user.role === "admin") return { id: user.id, isAdmin: true, primaryGroupIds: new Set() };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("coach_groups")
    .select("group_id")
    .eq("coach_id", user.id)
    .eq("is_primary", true)
    .eq("is_active", true);
  return {
    id: user.id,
    isAdmin: false,
    primaryGroupIds: new Set(((data ?? []) as { group_id: string }[]).map((r) => r.group_id)),
  };
}

const SCHEDULE_DENIED = { error: "Only admins and the group's primary coach can change its schedule" };

function requireCoachOrAdmin(user: { role: string; is_coach: boolean } | null) {
  // Coaches, admins, and players with coach access
  if (!user || !coachOrAdmin(accountOf(user))) {
    return { error: "Unauthorized: coach or admin access required" };
  }
  return null;
}

// ═══════════════════════════════════════
// GROUP MANAGEMENT (Admin only)
// ═══════════════════════════════════════

export async function createGroup(formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("groups").insert({
    name: (formData.get("name") as string)?.trim(),
    description: (formData.get("description") as string)?.trim() || null,
    level: formData.get("level") as string,
    max_players: Number(formData.get("max_players")) || 20,
    // A checkbox is only sent when ticked
    in_leaderboard: formData.get("in_leaderboard") === "on",
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  return { success: true };
}

export async function updateGroup(id: string, formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("groups")
    .update({
      name: (formData.get("name") as string)?.trim(),
      description: (formData.get("description") as string)?.trim() || null,
      level: formData.get("level") as string,
      max_players: Number(formData.get("max_players")) || 20,
      in_leaderboard: formData.get("in_leaderboard") === "on",
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${id}`);
  return { success: true };
}

export async function toggleGroupActive(id: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: group } = await supabase
    .from("groups")
    .select("is_active")
    .eq("id", id)
    .single();

  if (!group) return { error: "Group not found" };

  const { error } = await supabase
    .from("groups")
    .update({ is_active: !group.is_active })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  return { success: true };
}

export async function deleteGroup(id: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Check for active players
  const { count: playerCount } = await admin
    .from("group_players")
    .select("*", { count: "exact", head: true })
    .eq("group_id", id)
    .eq("is_active", true);

  if (playerCount && playerCount > 0) {
    return { error: "Cannot delete group with active players. Remove all players first." };
  }

  // Check for attendance records
  const { count: attendanceCount } = await admin
    .from("attendance")
    .select("*", { count: "exact", head: true })
    .eq("group_id", id);

  if (attendanceCount && attendanceCount > 0) {
    return { error: "Cannot delete group with attendance records." };
  }

  // Check for active schedule sessions
  const { count: scheduleCount } = await admin
    .from("schedule_sessions")
    .select("*", { count: "exact", head: true })
    .eq("group_id", id)
    .eq("is_active", true);

  if (scheduleCount && scheduleCount > 0) {
    return { error: "Cannot delete group with active schedule sessions. Remove all sessions first." };
  }

  // Safe to delete — CASCADE handles inactive records
  const { error } = await admin
    .from("groups")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/coaches");
  return { success: true };
}

// ═══════════════════════════════════════
// GROUP PLAYER MANAGEMENT (Admin only)
// ═══════════════════════════════════════

export async function addPlayersToGroup(groupId: string, playerIds: string[]) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Check group capacity
  const { data: group } = await admin
    .from("groups")
    .select("max_players")
    .eq("id", groupId)
    .single();

  if (!group) return { error: "Group not found" };

  const { count: currentCount } = await admin
    .from("group_players")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("is_active", true);

  if ((currentCount || 0) + playerIds.length > group.max_players) {
    return { error: `Cannot add ${playerIds.length} players. Group capacity is ${group.max_players}, currently has ${currentCount || 0} players.` };
  }

  // Upsert players (reactivate if previously removed)
  for (const playerId of playerIds) {
    const { data: existing } = await admin
      .from("group_players")
      .select("id, is_active")
      .eq("group_id", groupId)
      .eq("player_id", playerId)
      .single();

    if (existing) {
      if (existing.is_active) continue; // Already active
      await admin
        .from("group_players")
        .update({ is_active: true, joined_at: new Date().toISOString().split("T")[0] })
        .eq("id", existing.id);
    } else {
      await admin.from("group_players").insert({
        group_id: groupId,
        player_id: playerId,
        is_active: true,
      });
    }
  }

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  return { success: true };
}

export async function removePlayerFromGroup(groupId: string, playerId: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from("group_players")
    .update({ is_active: false })
    .eq("group_id", groupId)
    .eq("player_id", playerId);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  return { success: true };
}

export async function removePlayersFromGroup(groupId: string, playerIds: string[]) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  if (playerIds.length === 0) return { error: "No players selected." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from("group_players")
    .update({ is_active: false })
    .eq("group_id", groupId)
    .in("player_id", playerIds);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  return { success: true };
}

// ═══════════════════════════════════════
// COACH ASSIGNMENT (Admin only)
// ═══════════════════════════════════════

export async function assignCoachToGroup(groupId: string, coachId: string, isPrimary: boolean) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // If setting as primary, unset other primary coaches for this group
  if (isPrimary) {
    await admin
      .from("coach_groups")
      .update({ is_primary: false })
      .eq("group_id", groupId)
      .eq("is_primary", true);
  }

  // Upsert coach assignment
  const { data: existing } = await admin
    .from("coach_groups")
    .select("id, is_active")
    .eq("group_id", groupId)
    .eq("coach_id", coachId)
    .single();

  if (existing) {
    await admin
      .from("coach_groups")
      .update({ is_active: true, is_primary: isPrimary })
      .eq("id", existing.id);
  } else {
    const { error } = await admin.from("coach_groups").insert({
      group_id: groupId,
      coach_id: coachId,
      is_primary: isPrimary,
      is_active: true,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  revalidatePath("/admin/coaches");
  return { success: true };
}

export async function removeCoachFromGroup(groupId: string, coachId: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from("coach_groups")
    .update({ is_active: false })
    .eq("group_id", groupId)
    .eq("coach_id", coachId);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  revalidatePath("/admin/coaches");
  return { success: true };
}

export async function setPrimaryCoach(groupId: string, coachId: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Unset all primary for this group
  await admin
    .from("coach_groups")
    .update({ is_primary: false })
    .eq("group_id", groupId)
    .eq("is_active", true);

  // Set the chosen coach as primary
  const { error } = await admin
    .from("coach_groups")
    .update({ is_primary: true })
    .eq("group_id", groupId)
    .eq("coach_id", coachId)
    .eq("is_active", true);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  return { success: true };
}

// ═══════════════════════════════════════
// SCHEDULE MANAGEMENT (Admin only)
// ═══════════════════════════════════════

export async function createScheduleSession(formData: FormData) {
  const groupId = formData.get("group_id") as string;
  const editor = await getScheduleEditor();
  if (!editor || !canEditGroupSchedule(editor, groupId || null)) return SCHEDULE_DENIED;

  // Admins and the group's primary coach, checked above. The schedule's database rules are
  // admin-only, so the change is made with the service role.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const coachId = sessionCoachId(editor, (formData.get("coach_id") as string) || null);
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;

  if (!startTime || !endTime) return { error: "Start time and end time are required." };
  // Treat 00:00 as midnight (end of day), which is valid after any start time
  const effectiveEnd = endTime === "00:00" ? "24:00" : endTime;
  if (effectiveEnd <= startTime) return { error: "End time must be after start time." };

  const endDate = (formData.get("end_date") as string)?.trim() || null;
  if (!endDate) return { error: "An end date is required." };

  const { error } = await supabase.from("schedule_sessions").insert({
    group_id: groupId,
    coach_id: coachId,
    day_of_week: Number(formData.get("day_of_week")),
    start_time: startTime,
    end_time: endTime,
    location: (formData.get("location") as string)?.trim() || null,
    end_date: endDate,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  return { success: true };
}

/** Create a one-off session on a specific date (not recurring) */
export async function createSingleSession(formData: FormData) {
  const groupId = formData.get("group_id") as string;
  if (!groupId) return { error: "A group is required." };
  const editor = await getScheduleEditor();
  if (!editor || !canEditGroupSchedule(editor, groupId)) return SCHEDULE_DENIED;

  // Admins and the group's primary coach, checked above. The schedule's database rules are
  // admin-only, so the change is made with the service role.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const coachId = sessionCoachId(editor, (formData.get("coach_id") as string) || null);
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;
  const sessionDate = (formData.get("session_date") as string)?.trim();

  if (!startTime || !endTime) return { error: "Start time and end time are required." };
  const effectiveEnd = endTime === "00:00" ? "24:00" : endTime;
  if (effectiveEnd <= startTime) return { error: "End time must be after start time." };
  if (!sessionDate) return { error: "A date is required." };

  // Derive day_of_week from the date, set end_date = same date so it only shows once
  const dayOfWeek = new Date(sessionDate + "T00:00:00").getDay();

  const { error } = await supabase.from("schedule_sessions").insert({
    group_id: groupId,
    coach_id: coachId,
    day_of_week: dayOfWeek,
    start_time: startTime,
    end_time: endTime,
    location: (formData.get("location") as string)?.trim() || null,
    end_date: sessionDate,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  return { success: true };
}

export async function updateScheduleSession(id: string, formData: FormData) {
  const editor = await getScheduleEditor();
  if (!editor) return SCHEDULE_DENIED;

  // Admins and the session's group's primary coach, checked once the session is loaded. The
  // schedule's database rules are admin-only, so the change is made with the service role.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;

  if (!startTime || !endTime) return { error: "Start time and end time are required." };
  const effectiveEnd = endTime === "00:00" ? "24:00" : endTime;
  if (effectiveEnd <= startTime) return { error: "End time must be after start time." };

  const endDate = (formData.get("end_date") as string)?.trim() || null;
  if (!endDate) return { error: "An end date is required." };

  // day_of_week handling is session-type aware, because callers differ:
  //  - Private (one-off) sessions: ALWAYS derive from end_date. The schedule renders
  //    a private session only on the weekday matching its end_date, so a mismatch
  //    makes it vanish from the calendar. (Its editor has no Day field.)
  //  - Group (recurring) sessions: honor the submitted day_of_week when the form
  //    provides one (the group-page editor has a Day picker), otherwise keep the
  //    existing recurrence day (the calendar edit drawer omits the field — and
  //    Number(null) === 0 would otherwise reset the session to Sunday).
  const { data: existing, error: fetchErr } = await supabase
    .from("schedule_sessions")
    .select("session_type, day_of_week, group_id, coach_id")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) return { error: "Session not found." };
  if (!canEditGroupSchedule(editor, existing.group_id)) return SCHEDULE_DENIED;
  const coachId = sessionCoachId(editor, (formData.get("coach_id") as string) || null, existing);

  const submittedDow = formData.get("day_of_week");
  const dayOfWeek =
    existing.session_type === "private"
      ? new Date(endDate + "T00:00:00").getDay()
      : submittedDow === null || submittedDow === ""
        ? existing.day_of_week
        : Number(submittedDow);

  const { error } = await supabase
    .from("schedule_sessions")
    .update({
      coach_id: coachId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      location: (formData.get("location") as string)?.trim() || null,
      end_date: endDate,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  return { success: true };
}

export async function deleteScheduleSession(id: string) {
  const editor = await getScheduleEditor();
  if (!editor) return SCHEDULE_DENIED;

  // Admins and the session's group's primary coach. The schedule's database rules are
  // admin-only, so the change is made with the service role.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: existing } = await supabase.from("schedule_sessions").select("group_id").eq("id", id).single();
  if (!existing) return { error: "Session not found." };
  if (!canEditGroupSchedule(editor, existing.group_id)) return SCHEDULE_DENIED;

  const { error } = await supabase
    .from("schedule_sessions")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  return { success: true };
}

/** Cancel a single occurrence of a recurring session on a specific date */
export async function cancelScheduleSessionDate(scheduleSessionId: string, date: string) {
  const editor = await getScheduleEditor();
  if (!editor) return SCHEDULE_DENIED;

  // Admins and the session's group's primary coach. Cancellations' database rules are
  // admin-only, so the change is made with the service role.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any;

  const { data: session } = await supabase
    .from("schedule_sessions")
    .select("group_id")
    .eq("id", scheduleSessionId)
    .single();
  if (!session) return { error: "Session not found." };
  if (!canEditGroupSchedule(editor, session.group_id)) return SCHEDULE_DENIED;

  const { error } = await supabase.from("schedule_session_cancellations").insert({
    schedule_session_id: scheduleSessionId,
    cancelled_date: date,
    cancelled_by: editor.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "This session is already cancelled for this date" };
    return { error: error.message };
  }

  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  return { success: true };
}

// ═══════════════════════════════════════
// ATTENDANCE (Coach + Admin)
// ═══════════════════════════════════════

export async function submitAttendance(data: {
  group_id: string | null;
  schedule_session_id: string;
  session_date: string;
  records: { player_id: string; status: "present" | "absent" | "excused"; notes?: string; subscription_id?: string }[];
}) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  // Past dates are allowed without limit; only future dates (in Cairo) are rejected
  if (isFutureCairoDate(data.session_date)) {
    return { error: "Cannot log attendance for future dates" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Moving a scored player away from present deletes their King of Court score. In a
  // closed leaderboard month the database refuses that; refuse here, before the loop
  // below has saved some players and not others.
  const closed = await closedMonthScoreBlock(
    admin,
    data,
    data.records.filter((r) => r.status !== "present").map((r) => r.player_id)
  );
  if (closed) return { error: closed };

  // Get the schedule session to find the time
  const { data: scheduleSession } = await admin
    .from("schedule_sessions")
    .select("start_time")
    .eq("id", data.schedule_session_id)
    .single();

  const sessionTime = scheduleSession?.start_time || null;

  const results: {
    player_id: string;
    sessions_remaining: number | null;
    updated: boolean;
    deducted: boolean;
    reason: string;
    subscription_id: string | null;
  }[] = [];

  // Use the RPC function for each player
  for (const record of data.records) {
    const { data: result, error } = await admin.rpc("log_attendance_with_deduction", {
      p_player_id: record.player_id,
      p_group_id: data.group_id,
      p_session_date: data.session_date,
      p_session_time: sessionTime,
      p_status: record.status,
      p_marked_by: user!.id,
      p_schedule_session_id: data.schedule_session_id,
      p_notes: record.notes || null,
      p_subscription_id: record.subscription_id || null,
    });

    if (error) {
      return { error: `Failed for player ${record.player_id}: ${error.message}` };
    }

    results.push({
      player_id: record.player_id,
      sessions_remaining: result?.sessions_remaining ?? null,
      updated: result?.updated ?? false,
      deducted: result?.deducted ?? false,
      reason: result?.reason ?? "unknown",
      subscription_id: result?.subscription_id ?? null,
    });
  }

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  revalidatePath("/admin/dashboard");
  revalidatePath("/coach/dashboard");
  return { success: true, results };
}

export async function removeAttendanceRecords(data: {
  group_id: string | null;
  schedule_session_id: string;
  session_date: string;
  player_ids: string[];
}) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  if (data.player_ids.length === 0) return { success: true };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Removing a scored player's attendance deletes their King of Court score. In a closed
  // leaderboard month the database refuses that delete, but only after the credits below
  // had been restored, leaving the player with both the attendance and the credit.
  const closed = await closedMonthScoreBlock(admin, data, data.player_ids);
  if (closed) return { error: closed };

  // Find existing attendance records for these players (match via schedule_session_id)
  let existingQuery = admin
    .from("attendance")
    .select("id, player_id, status, subscription_id")
    .eq("schedule_session_id", data.schedule_session_id)
    .eq("session_date", data.session_date)
    .in("player_id", data.player_ids);
  if (data.group_id) {
    existingQuery = existingQuery.eq("group_id", data.group_id);
  } else {
    existingQuery = existingQuery.is("group_id", null);
  }
  const { data: existing, error: fetchErr } = await existingQuery;

  if (fetchErr) return { error: fetchErr.message };
  if (!existing || existing.length === 0) return { success: true };

  // For players who were marked "present", re-credit the exact subscription the
  // attendance was deducted from (falls back to the old heuristic for legacy rows
  // written before attendance.subscription_id existed).
  const presentRecords = existing.filter(
    (r: { status: string }) => r.status === "present"
  ) as { player_id: string; subscription_id: string | null }[];

  for (const record of presentRecords) {
    await admin.rpc("restore_session_credit", {
      p_player_id: record.player_id,
      p_subscription_id: record.subscription_id,
    });
  }

  // Delete the attendance records
  const ids = existing.map((r: { id: string }) => r.id);
  const { error: delErr } = await admin
    .from("attendance")
    .delete()
    .in("id", ids);

  if (delErr) return { error: delErr.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  revalidatePath("/admin/dashboard");
  revalidatePath("/coach/dashboard");
  return { success: true };
}

export async function updateAttendanceRecord(
  id: string,
  status: string,
  notes?: string
) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const updateData: Record<string, unknown> = { status };
  if (notes !== undefined) updateData.notes = notes;

  const { error } = await supabase
    .from("attendance")
    .update(updateData)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  return { success: true };
}

// ═══════════════════════════════════════
// QUICK-ADD PLAYER (Admin only)
// ═══════════════════════════════════════

export async function quickAddPlayer(firstName: string, lastName: string) {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  if (!firstName.trim() || !lastName.trim()) {
    return { error: "First name and last name are required" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Create a minimal auth user with a placeholder email (required by profiles FK to auth.users)
  const placeholderEmail = `guest-${crypto.randomUUID()}@noaccount.local`;
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: placeholderEmail,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role: "player",
    },
  });

  if (authError) return { error: authError.message };

  const playerId = authData.user.id;

  // Update the auto-created profile (trigger creates it) to clear the placeholder email
  await admin
    .from("profiles")
    .update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: null,
      role: "player",
      is_active: true,
      profile_completed: true,
    })
    .eq("id", playerId);

  revalidatePath("/admin/players");
  return { success: true, playerId, name: `${firstName.trim()} ${lastName.trim()}` };
}

// ═══════════════════════════════════════
// COACH MANAGEMENT (Admin only)
// ═══════════════════════════════════════

export async function updateCoach(coachId: string, formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  if (!firstName || !lastName) return { error: "First and last name are required" };

  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const area = (formData.get("area") as string)?.trim() || null;
  const isActive = formData.get("is_active") !== "false";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Coaches are real login accounts — keep the auth login email in step with the
  // displayed email so editing it here doesn't desync the credential.
  if (email) {
    const { data: existing } = await admin.auth.admin.getUserById(coachId);
    if (existing?.user && existing.user.email !== email) {
      const { error: authErr } = await admin.auth.admin.updateUserById(coachId, { email, email_confirm: true });
      if (authErr) return { error: `Failed to update email: ${authErr.message}` };
    }
  }

  // For a player who coaches, is_active is their player account's status: it's managed
  // from Players, never from here
  const { data: target } = await admin.from("profiles").select("role").eq("id", coachId).single();
  const update: Record<string, unknown> = { first_name: firstName, last_name: lastName, email, phone, area };
  if (target?.role !== "player") update.is_active = isActive;

  const { error } = await admin
    .from("profiles")
    .update(update)
    .eq("id", coachId)
    .eq("is_coach", true);

  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  revalidatePath(`/admin/coaches/${coachId}`);
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function deleteCoach(coachId: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Never delete an admin or a player via the coaches list — either can also be a coach
  // (is_coach=true), and identity/is_active live on the single shared profile row.
  const { data: target } = await admin.from("profiles").select("role").eq("id", coachId).single();
  if (!target) return { error: "Coach not found" };
  if (target.role === "admin") {
    return { error: "This account is also an admin and can't be deleted from the coaches list." };
  }
  if (target.role === "player") {
    return { error: "This coach is also a player. Use Remove coach access instead." };
  }

  // Clean path first (works for a coach with no history). If FK references block
  // the cascade, clear the RESTRICT refs a coach can hold, then retry.
  //
  // These are the ONLY non-cascade refs a role=coach target can populate. Other
  // RESTRICT audit columns (expenses.created_by, whatsapp_templates.created_by,
  // system_settings.updated_by, schedule_photos.uploaded_by) are written by
  // admin-only actions, and admins are refused above — so a deletable coach never
  // references them. Revisit this list if a coach is ever allowed to write those.
  let { error } = await admin.auth.admin.deleteUser(coachId);
  if (error) {
    await admin.from("schedule_sessions").update({ coach_id: null }).eq("coach_id", coachId);
    await admin.from("attendance").update({ marked_by: null }).eq("marked_by", coachId);
    await admin.from("payments").update({ confirmed_by: null }).eq("confirmed_by", coachId);
    await admin.from("coach_blocks").update({ created_by: null }).eq("created_by", coachId);
    await admin.from("feedback").delete().eq("coach_id", coachId);
    ({ error } = await admin.auth.admin.deleteUser(coachId));
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function bulkDeleteCoaches(coachIds: string[]) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const results = { success: 0, failed: 0 };
  for (const id of coachIds) {
    const res = await deleteCoach(id);
    if ("error" in res) results.failed++;
    else results.success++;
  }

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/dashboard");
  return { success: true, results };
}

/** Make an existing player a coach on their own account: they keep role 'player', so they
 *  stay in every player list, and gain the coach view. */
export async function assignPlayerAsCoach(playerId: string): Promise<{ error: string } | { success: true }> {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: target } = await admin
    .from("profiles")
    .select("role, is_coach, is_active")
    .eq("id", playerId)
    .single();
  if (!target || target.role !== "player") return { error: "Player not found" };
  if (!target.is_active) return { error: "This player's account is inactive" };
  if (target.is_coach) return { error: "This player is already a coach" };

  const { error } = await admin
    .from("profiles")
    .update({ is_coach: true, updated_at: new Date().toISOString() })
    .eq("id", playerId);
  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

/** Take coach access away from a player who coaches. Their player account and history stay;
 *  they come off the groups they coach. Coach-only accounts are deleted instead (deleteCoach). */
export async function removeCoachAccess(coachId: string): Promise<{ error: string } | { success: true }> {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { data: target } = await admin.from("profiles").select("role, is_coach").eq("id", coachId).single();
  if (!target || target.role !== "player" || !target.is_coach) {
    return { error: "Only a player who coaches can have coach access removed" };
  }

  // Groups first: if this fails they're still a coach, and the admin can try again from their drawer
  const { error: groupsError } = await admin
    .from("coach_groups")
    .update({ is_active: false })
    .eq("coach_id", coachId)
    .eq("is_active", true);
  if (groupsError) return { error: groupsError.message };

  const { error } = await admin
    .from("profiles")
    .update({ is_coach: false, updated_at: new Date().toISOString() })
    .eq("id", coachId);
  if (error) return { error: error.message };

  revalidatePath("/admin/coaches");
  revalidatePath("/admin/groups");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

// ═══════════════════════════════════════
// SESSION PLANS (Coach + Admin)
// ═══════════════════════════════════════

export async function upsertSessionPlan(data: {
  schedule_session_id: string;
  session_date: string;
  goal: string | null;
  description: string | null;
}) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error } = await admin
    .from("session_plans")
    .upsert(
      {
        schedule_session_id: data.schedule_session_id,
        session_date: data.session_date,
        goal: data.goal?.trim() || null,
        description: data.description?.trim() || null,
        updated_by: user!.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "schedule_session_id,session_date" },
    );

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  return { success: true };
}

// ── Coach attendance ──
// Who actually ran a session, as opposed to `schedule_sessions.coach_id`, which
// only says who was assigned. Admin-only: coaches can read their own rows but the
// RLS policy does not let them write, so this goes through the admin client.
export async function submitCoachAttendance(data: {
  schedule_session_id: string;
  session_date: string;
  records: { coach_id: string; status: "present" | "absent" | "excused"; notes?: string }[];
  /** Coaches the admin cleared — their rows are removed rather than left stale */
  cleared_coach_ids?: string[];
}) {
  const user = await getCurrentUserRole();
  // Admin-only, matching the RLS policy: a coach can read their own record but not write it
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  // Same rule as player attendance: backfilling the past is fine, the future is not
  if (isFutureCairoDate(data.session_date)) {
    return { error: "Cannot log coach attendance for future dates" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  if (data.cleared_coach_ids && data.cleared_coach_ids.length > 0) {
    const { error: delErr } = await admin
      .from("coach_attendance")
      .delete()
      .eq("schedule_session_id", data.schedule_session_id)
      .eq("session_date", data.session_date)
      .in("coach_id", data.cleared_coach_ids);
    if (delErr) return { error: delErr.message };
  }

  if (data.records.length > 0) {
    const rows = data.records.map((r) => ({
      coach_id: r.coach_id,
      schedule_session_id: data.schedule_session_id,
      session_date: data.session_date,
      status: r.status,
      notes: r.notes ?? null,
      marked_by: user!.id,
    }));

    // Upsert on the unique key so re-saving a session updates in place
    const { error } = await admin
      .from("coach_attendance")
      .upsert(rows, { onConflict: "coach_id,schedule_session_id,session_date" });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/daily-report");
  return { success: true };
}
