"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { cairoToday } from "@/lib/utils/cairo-time";
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
