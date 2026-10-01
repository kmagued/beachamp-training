"use server";

import { randomUUID } from "node:crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cairoMonthKey, cairoToday } from "@/lib/utils/cairo-time";
import { awardNotification, canCloseMonth, monthAwards } from "@/lib/king-of-court/awards";
import { formatMonth } from "@/lib/king-of-court/format";
import { loadLeaderboard } from "@/lib/king-of-court/load";
import { closedMonthBlock } from "@/lib/king-of-court/lock";
import { isMonth, monthOfDate } from "@/lib/king-of-court/month";
import { checkScoreSave, type ScoreEntry } from "@/lib/king-of-court/save";

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

// ═══════════════════════════════════════
// KING OF COURT SCORES (Admin only)
// ═══════════════════════════════════════

// Points each present player scored in a group session's King of Court game, logged
// from the Daily Report. A blank box means the player didn't play: a previously saved
// row is deleted (cleared_player_ids) rather than kept or stored as 0.
export async function saveKingOfCourtScores(data: {
  schedule_session_id: string;
  session_date: string;
  scores: ScoreEntry[];
  cleared_player_ids: string[];
}): Promise<{ success: true } | { error: string; reload?: boolean }> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  if (!Array.isArray(data.scores) || !Array.isArray(data.cleared_player_ids)) {
    return { error: "Invalid request" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.session_date)) return { error: "Invalid session date" };
  // Same rule as attendance: backfilling the past is fine, the future is not
  if (data.session_date > cairoToday()) return { error: "Cannot log scores for future dates" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // The database refuses this too; refusing here lets the Scores tab reload as read-only
  const closed = await closedMonthBlock(admin, monthOfDate(data.session_date));
  if (closed) return { error: closed, reload: true };

  const { data: session } = await admin
    .from("schedule_sessions")
    .select("id, group_id, session_type, groups(in_leaderboard)")
    .eq("id", data.schedule_session_id)
    .maybeSingle();
  if (!session || session.session_type !== "group" || !session.group_id) {
    return { error: "Scores can only be logged for group sessions" };
  }
  if (session.groups?.in_leaderboard === false) {
    return { error: "This group isn't on the leaderboard, so it has no scores" };
  }

  const { data: presentRows, error: attErr } = await admin
    .from("attendance")
    .select("player_id, group_id")
    .eq("schedule_session_id", data.schedule_session_id)
    .eq("session_date", data.session_date)
    .eq("status", "present");
  if (attErr) return { error: attErr.message };

  // The group each player attended under. Attendance keeps it even if the session's
  // group is edited later, so re-saving old scores never moves them between leaderboards.
  const groupOf = new Map<string, string>();
  for (const r of (presentRows || []) as { player_id: string; group_id: string | null }[]) {
    groupOf.set(r.player_id, r.group_id ?? session.group_id);
  }

  // The database trigger refuses non-present players too; this gives a readable message
  const problem = checkScoreSave(data.scores, data.cleared_player_ids, new Set(groupOf.keys()));
  if (problem) return problem;

  if (data.cleared_player_ids.length > 0) {
    const { error } = await admin
      .from("king_of_court_scores")
      .delete()
      .eq("schedule_session_id", data.schedule_session_id)
      .eq("session_date", data.session_date)
      .in("player_id", data.cleared_player_ids);
    if (error) return { error: error.message };
  }

  if (data.scores.length > 0) {
    const rows = data.scores.map((s) => ({
      player_id: s.player_id,
      schedule_session_id: data.schedule_session_id,
      group_id: groupOf.get(s.player_id)!,
      session_date: data.session_date,
      points: s.points,
      entered_by: user!.id,
    }));
    // Upsert on the unique key so re-saving a session updates in place
    const { error } = await admin
      .from("king_of_court_scores")
      .upsert(rows, { onConflict: "player_id,schedule_session_id,session_date" });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/daily-report");
  revalidatePath("/admin/leaderboard");
  return { success: true };
}

// ═══════════════════════════════════════
// CLOSING A MONTH (Admin only)
// ═══════════════════════════════════════

/** Every page that shows a month's state or a player's awards */
function revalidateLeaderboards() {
  for (const path of [
    "/admin/leaderboard",
    "/coach/leaderboard",
    "/player/leaderboard",
    "/player/achievements",
    "/player/dashboard",
    "/admin/daily-report",
  ]) {
    revalidatePath(path);
  }
}

// Closing locks the month's scores and awards each group's top two. The order matters:
// the close row goes in first, because from then on the database refuses score changes,
// so the awards are ranked from scores that can no longer move. Notifications go last,
// in one insert, so nobody is told (or emailed, by the notifications webhook) about an
// award unless the whole close succeeded.
export async function closeLeaderboardMonth(
  month: string
): Promise<{ success: true; awards: number } | { error: string }> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  if (typeof month !== "string" || !isMonth(month)) return { error: "Invalid month" };
  // Cairo's month, not the server's (UTC): around midnight on the 1st they differ
  if (!canCloseMonth(month, cairoMonthKey(new Date()))) {
    return { error: "A month that hasn't started can't be closed" };
  }
  const label = formatMonth(month, "long");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const { error: closeErr } = await admin
    .from("leaderboard_month_closes")
    .insert({ month, closed_by: user!.id });
  if (closeErr) {
    // 23505 is the primary key: another admin, or a second click, closed it first
    return { error: closeErr.code === "23505" ? `${label} is already closed` : closeErr.message };
  }

  try {
    const data = await loadLeaderboard(month, null);
    const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
    const awards = monthAwards(data.scores).map((a) => ({ ...a, month, notification_id: randomUUID() }));

    if (awards.length > 0) {
      const { error: awardErr } = await admin.from("leaderboard_awards").insert(awards);
      if (awardErr) throw new Error(awardErr.message);

      // Straight into the table rather than through createNotification, which would
      // send a second email on top of the webhook's
      const { error: notifyErr } = await admin.from("notifications").insert(
        awards.map((a) => ({
          id: a.notification_id,
          user_id: a.player_id,
          ...awardNotification({
            place: a.place,
            groupName: groupName.get(a.group_id) ?? "your group",
            month,
            points: a.points,
            sessions: a.sessions,
          }),
          type: "system",
          link: "/player/achievements",
        }))
      );
      if (notifyErr) throw new Error(notifyErr.message);
    }

    revalidateLeaderboards();
    return { success: true, awards: awards.length };
  } catch (err) {
    // Put the month back as it was: the awards go with the close row
    const { error: undoErr } = await admin.from("leaderboard_month_closes").delete().eq("month", month);
    if (undoErr) console.error(`[king-of-court] could not undo the failed close of ${month}:`, undoErr.message);
    revalidateLeaderboards();
    const reason = err instanceof Error ? err.message : "unknown error";
    return { error: `Couldn't close ${label}: ${reason}` };
  }
}

// Reopening deletes the close row. The month's awards go with it (ON DELETE CASCADE) and
// its scores unlock; closing again awards afresh.
export async function reopenLeaderboardMonth(month: string): Promise<{ success: true } | { error: string }> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  if (typeof month !== "string" || !isMonth(month)) return { error: "Invalid month" };
  const label = formatMonth(month, "long");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // Read before the delete: the awards, and their notification ids, are about to go
  const { data: awardRows, error: awardErr } = await admin
    .from("leaderboard_awards")
    .select("notification_id")
    .eq("month", month);
  if (awardErr) return { error: awardErr.message };

  const { data: removed, error: reopenErr } = await admin
    .from("leaderboard_month_closes")
    .delete()
    .eq("month", month)
    .select("month");
  if (reopenErr) return { error: reopenErr.message };
  if (!removed || removed.length === 0) return { error: `${label} isn't closed` };

  // Take back the notifications nobody has opened. One that was read stays in the inbox.
  const notificationIds = ((awardRows || []) as { notification_id: string | null }[])
    .map((a) => a.notification_id)
    .filter((id): id is string => id !== null);
  if (notificationIds.length > 0) {
    const { error: notifyErr } = await admin
      .from("notifications")
      .delete()
      .in("id", notificationIds)
      .eq("is_read", false);
    // The month is already open, which is what was asked for: don't report a failure
    if (notifyErr) console.error(`[king-of-court] could not remove ${month}'s award notifications:`, notifyErr.message);
  }

  revalidateLeaderboards();
  return { success: true };
}
