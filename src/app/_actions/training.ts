"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
    .select("id, role")
    .eq("id", user.id)
    .single();

  return profile ? { id: profile.id, role: profile.role as string } : null;
}

function requireAdmin(user: { role: string } | null) {
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized: admin access required" };
  }
  return null;
}

function requireCoachOrAdmin(user: { role: string } | null) {
  if (!user || (user.role !== "coach" && user.role !== "admin")) {
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
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const groupId = formData.get("group_id") as string;
  const coachId = (formData.get("coach_id") as string) || null;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;

  if (!startTime || !endTime) return { error: "Start time and end time are required." };
  if (endTime <= startTime) return { error: "End time must be after start time." };

  const { error } = await supabase.from("schedule_sessions").insert({
    group_id: groupId,
    coach_id: coachId,
    day_of_week: Number(formData.get("day_of_week")),
    start_time: startTime,
    end_time: endTime,
    location: (formData.get("location") as string)?.trim() || null,
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
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const coachId = (formData.get("coach_id") as string) || null;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;

  if (!startTime || !endTime) return { error: "Start time and end time are required." };
  if (endTime <= startTime) return { error: "End time must be after start time." };

  const { error } = await supabase
    .from("schedule_sessions")
    .update({
      coach_id: coachId,
      day_of_week: Number(formData.get("day_of_week")),
      start_time: startTime,
      end_time: endTime,
      location: (formData.get("location") as string)?.trim() || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/groups");
  revalidatePath("/admin/schedule");
  revalidatePath("/coach/schedule");
  return { success: true };
}

export async function deleteScheduleSession(id: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

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

// ═══════════════════════════════════════
// ATTENDANCE (Coach + Admin)
// ═══════════════════════════════════════

export async function submitAttendance(data: {
  group_id: string;
  schedule_session_id: string;
  session_date: string;
  records: { player_id: string; status: "present" | "absent" | "excused"; notes?: string }[];
}) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  // Validate date is within last 7 days
  const sessionDate = new Date(data.session_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  if (sessionDate < sevenDaysAgo) {
    return { error: "Cannot log attendance more than 7 days in the past" };
  }
  if (sessionDate > today) {
    return { error: "Cannot log attendance for future dates" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Get the schedule session to find the time
  const { data: scheduleSession } = await admin
    .from("schedule_sessions")
    .select("start_time")
    .eq("id", data.schedule_session_id)
    .single();

  const sessionTime = scheduleSession?.start_time || null;

  const results: { player_id: string; sessions_remaining: number | null; updated: boolean }[] = [];

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
    });

    if (error) {
      return { error: `Failed for player ${record.player_id}: ${error.message}` };
    }

    results.push({
      player_id: record.player_id,
      sessions_remaining: result?.sessions_remaining ?? null,
      updated: result?.updated ?? false,
    });
  }

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  revalidatePath("/admin/dashboard");
  revalidatePath("/coach/dashboard");
  return { success: true, results };
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
// FEEDBACK (Coach + Admin)
// ═══════════════════════════════════════

export async function submitFeedback(data: {
  player_id: string;
  session_date: string;
  rating: number;
  comment?: string;
}) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  if (data.rating < 1 || data.rating > 5) {
    return { error: "Rating must be between 1 and 5" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("feedback").insert({
    player_id: data.player_id,
    coach_id: user!.id,
    session_date: data.session_date,
    rating: data.rating,
    comment: data.comment?.trim() || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  revalidatePath("/player/feedback");
  return { success: true };
}

export async function updateFeedback(
  id: string,
  data: { rating?: number; comment?: string }
) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Check 48-hour edit window
  const { data: existing } = await supabase
    .from("feedback")
    .select("created_at, coach_id")
    .eq("id", id)
    .single();

  if (!existing) return { error: "Feedback not found" };

  // Only the author can edit (unless admin)
  if (user!.role !== "admin" && existing.coach_id !== user!.id) {
    return { error: "You can only edit your own feedback" };
  }

  const createdAt = new Date(existing.created_at);
  const now = new Date();
  const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  if (hoursDiff > 48 && user!.role !== "admin") {
    return { error: "Cannot edit feedback after 48 hours" };
  }

  const updateData: Record<string, unknown> = {};
  if (data.rating !== undefined) updateData.rating = data.rating;
  if (data.comment !== undefined) updateData.comment = data.comment.trim() || null;

  const { error } = await supabase
    .from("feedback")
    .update(updateData)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  revalidatePath("/player/feedback");
  return { success: true };
}

export async function deleteFeedback(id: string) {
  const user = await getCurrentUserRole();
  const authErr = requireCoachOrAdmin(user);
  if (authErr) return authErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Check ownership
  const { data: existing } = await supabase
    .from("feedback")
    .select("coach_id, created_at")
    .eq("id", id)
    .single();

  if (!existing) return { error: "Feedback not found" };

  if (user!.role !== "admin" && existing.coach_id !== user!.id) {
    return { error: "You can only delete your own feedback" };
  }

  const createdAt = new Date(existing.created_at);
  const now = new Date();
  const hoursDiff = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  if (hoursDiff > 48 && user!.role !== "admin") {
    return { error: "Cannot delete feedback after 48 hours" };
  }

  const { error } = await supabase
    .from("feedback")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/sessions");
  revalidatePath("/coach/sessions");
  revalidatePath("/player/feedback");
  return { success: true };
}

// ═══════════════════════════════════════
// COACH MANAGEMENT (Admin only)
// ═══════════════════════════════════════

export async function createCoach(formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const email = (formData.get("email") as string)?.trim();
  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const password = (formData.get("password") as string)?.trim();

  if (!email || !firstName || !lastName || !password) {
    return { error: "Email, first name, last name, and password are required" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Create auth user with coach role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authData, error: authError2 } = await (admin as any).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      phone,
      role: "coach",
    },
  });

  if (authError2) {
    if (authError2.message?.includes("already been registered")) {
      return { error: "A user with this email already exists" };
    }
    return { error: authError2.message };
  }

  // Profile is auto-created by the trigger, but update phone if needed
  if (phone && authData?.user) {
    await admin
      .from("profiles")
      .update({ phone })
      .eq("id", authData.user.id);
  }

  revalidatePath("/admin/coaches");
  return { success: true, password };
}
