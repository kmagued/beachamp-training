// Ranking a group's month of King of Court scores, and one player's breakdown.
// Pure functions: the leaderboard page fetches the rows and these turn them into tables.

export interface ScoreRow {
  player_id: string;
  group_id: string;
  schedule_session_id: string;
  /** YYYY-MM-DD */
  session_date: string;
  /** HH:MM:SS, from schedule_sessions */
  start_time: string;
  points: number;
}

export interface PlayerName {
  first_name: string;
  last_name: string;
}

export interface Standing {
  player_id: string;
  total: number;
  /** Sessions scored, including 0-point ones */
  sessions: number;
  best: number;
  /** Competition ranking: 1, 1, 3 */
  rank: number;
  /** Shares first place with more than 0 points */
  isWinner: boolean;
}

export interface BreakdownRow {
  schedule_session_id: string;
  session_date: string;
  start_time: string;
  points: number;
  /** The player's place in that session occurrence (ties share it) */
  place: number;
  /** How many players were scored in that occurrence */
  fieldSize: number;
}

/**
 * Standings for one group's month. Most points first; level on points, fewer sessions
 * ranks higher; level on both, the players share the rank and the next one skips.
 * Players sharing a rank keep input order; the page sorts those by name.
 */
export function buildStandings(scores: ScoreRow[]): Standing[] {
  const byPlayer = new Map<string, { total: number; sessions: number; best: number }>();
  for (const s of scores) {
    const agg = byPlayer.get(s.player_id) ?? { total: 0, sessions: 0, best: 0 };
    agg.total += s.points;
    agg.sessions += 1;
    agg.best = Math.max(agg.best, s.points);
    byPlayer.set(s.player_id, agg);
  }

  const rows = [...byPlayer.entries()].map(([player_id, agg]) => ({ player_id, ...agg }));
  rows.sort((a, b) => b.total - a.total || a.sessions - b.sessions);

  const standings: Standing[] = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tiedWithPrev = prev !== undefined && prev.total === r.total && prev.sessions === r.sessions;
    const rank = tiedWithPrev ? standings[i - 1].rank : i + 1;
    standings.push({ ...r, rank, isWinner: rank === 1 && r.total > 0 });
  });
  return standings;
}

/** Rows split by the group they were logged under */
export function groupScores(scores: ScoreRow[]): Map<string, ScoreRow[]> {
  const byGroup = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    const rows = byGroup.get(s.group_id);
    if (rows) rows.push(s);
    else byGroup.set(s.group_id, [s]);
  }
  return byGroup;
}

/**
 * One player's scored sessions from a group's month of rows, oldest first. The place
 * compares them with everyone scored in the same occurrence (session + date).
 */
export function playerBreakdown(scores: ScoreRow[], playerId: string): BreakdownRow[] {
  const byOccurrence = new Map<string, ScoreRow[]>();
  for (const s of scores) {
    const key = `${s.schedule_session_id}|${s.session_date}`;
    const rows = byOccurrence.get(key);
    if (rows) rows.push(s);
    else byOccurrence.set(key, [s]);
  }

  const breakdown: BreakdownRow[] = [];
  for (const occurrence of byOccurrence.values()) {
    const mine = occurrence.find((s) => s.player_id === playerId);
    if (!mine) continue;
    breakdown.push({
      schedule_session_id: mine.schedule_session_id,
      session_date: mine.session_date,
      start_time: mine.start_time,
      points: mine.points,
      place: 1 + occurrence.filter((s) => s.points > mine.points).length,
      fieldSize: occurrence.length,
    });
  }
  breakdown.sort((a, b) => a.session_date.localeCompare(b.session_date) || a.start_time.localeCompare(b.start_time));
  return breakdown;
}
