// Closed leaderboard months, checked on the server before a write that would change their
// scores. The database refuses those writes too (kotc_refuse_closed_month); these checks
// refuse earlier, before anything is half-done, and with nothing thrown: each returns the
// message to refuse with, or null to go ahead.

import { closedMonthMessage } from "./awards";
import { monthOfDate } from "./month";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

const CHECK_FAILED = "Couldn't check whether the leaderboard is closed";

async function checkMonth(admin: AdminClient, month: string): Promise<{ closed: boolean } | { failed: string }> {
  const { data, error } = await admin
    .from("leaderboard_month_closes")
    .select("month")
    .eq("month", month)
    .maybeSingle();
  // Refuse rather than guess: going ahead unchecked could undo a closed month's awards
  if (error) return { failed: `${CHECK_FAILED}: ${error.message}` };
  return { closed: data !== null };
}

/** The message to refuse with when this month ("YYYY-MM") is closed; null when it is open */
export async function closedMonthBlock(admin: AdminClient, month: string): Promise<string | null> {
  const check = await checkMonth(admin, month);
  if ("failed" in check) return check.failed;
  return check.closed ? closedMonthMessage(month) : null;
}

/**
 * The message to refuse with when the date's month is closed and any of these players
 * holds a score for this session occurrence; null when the change may go ahead. An
 * attendance change for such a player would delete their score.
 */
export async function closedMonthScoreBlock(
  admin: AdminClient,
  occurrence: { schedule_session_id: string; session_date: string },
  playerIds: string[]
): Promise<string | null> {
  if (playerIds.length === 0) return null;

  const month = monthOfDate(occurrence.session_date);
  const check = await checkMonth(admin, month);
  if ("failed" in check) return check.failed;
  if (!check.closed) return null;

  const { count, error } = await admin
    .from("king_of_court_scores")
    .select("id", { count: "exact", head: true })
    .eq("schedule_session_id", occurrence.schedule_session_id)
    .eq("session_date", occurrence.session_date)
    .in("player_id", playerIds);
  if (error) return `${CHECK_FAILED}: ${error.message}`;
  return (count ?? 0) > 0 ? closedMonthMessage(month) : null;
}
