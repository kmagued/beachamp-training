// Who is awarded when a leaderboard month is closed, and the words that go with an award.
// Pure functions: the close confirmation, the server action and the Achievements page all
// use them, so the three can't disagree.

import { formatMonth, joinNames, ordinal } from "./format";
import { buildStandings, groupScores, type ScoreRow } from "./leaderboard";

export type Place = 1 | 2;

export interface Award {
  group_id: string;
  player_id: string;
  place: Place;
  /** The player's total for the month at closing */
  points: number;
  /** Sessions scored that month, including 0-point ones */
  sessions: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Everyone ranked 1st or 2nd with points, for each group in a month of scores. The place
 * is the rank, so ties share it: ranks 1, 1, 3 give two 1st places and no 2nd.
 */
export function monthAwards(scores: ScoreRow[]): Award[] {
  const awards: Award[] = [];
  for (const [group_id, rows] of groupScores(scores)) {
    for (const s of buildStandings(rows)) {
      if (s.rank > 2 || s.total <= 0) continue;
      awards.push({ group_id, player_id: s.player_id, place: s.rank as Place, points: s.total, sessions: s.sessions });
    }
  }
  return awards;
}

/** Any month up to the current one may be closed; a month that hasn't started may not */
export function canCloseMonth(month: string, currentMonth: string): boolean {
  // "YYYY-MM" strings order the same way the months do
  return month <= currentMonth;
}

/** "1st place" / "2nd place" */
export function placeLabel(place: Place): string {
  return `${ordinal(place)} place`;
}

/** "142 points from 8 sessions" */
export function awardSummary(points: number, sessions: number): string {
  return `${plural(points, "point")} from ${plural(sessions, "session")}`;
}

/**
 * One group's lines for the close confirmation, e.g. "1st: A & B (142 pts)". Players
 * sharing a place share its points, so one figure covers them all.
 */
export function groupAwardSummary(
  awards: Award[],
  groupId: string,
  nameOf: (playerId: string) => string
): { first: string | null; second: string | null } {
  const line = (place: Place) => {
    const placed = awards.filter((a) => a.group_id === groupId && a.place === place);
    if (placed.length === 0) return null;
    return `${ordinal(place)}: ${joinNames(placed.map((a) => nameOf(a.player_id)))} (${placed[0].points} pts)`;
  };
  return { first: line(1), second: line(2) };
}

/**
 * The notification an awarded player receives. The group name is never made possessive:
 * "Women's Team's" and "Juniors's" read badly.
 */
export function awardNotification(a: {
  place: Place;
  groupName: string;
  month: string;
  points: number;
  sessions: number;
}): { title: string; body: string } {
  const contest = `the ${a.groupName} King of Court for ${formatMonth(a.month, "long")}`;
  return {
    title: a.place === 1 ? `You won ${contest}` : `You finished 2nd in ${contest}`,
    body: `${awardSummary(a.points, a.sessions)}.`,
  };
}

/**
 * The refusal shown when a change would alter a closed month's scores. The database
 * trigger kotc_refuse_closed_month raises the same sentence.
 */
export function closedMonthMessage(month: string): string {
  return `The ${formatMonth(month, "long")} leaderboard is closed, and this would change its scores. An admin can reopen it from the Leaderboard.`;
}

/** Newest month first; within a month 1st place before 2nd, then by group name */
export function sortAwards<T extends { month: string; place: Place; group_name: string }>(awards: T[]): T[] {
  return [...awards].sort(
    (a, b) => b.month.localeCompare(a.month) || a.place - b.place || a.group_name.localeCompare(b.group_name)
  );
}
