// Turning a Scores card's boxes into a save request, and the server's check on one.

import { isValidPoints, parsePoints } from "./points";

export interface ScoreEntry {
  player_id: string;
  points: number;
}

export interface SavePayload {
  scores: ScoreEntry[];
  /** Players whose saved score was blanked: their rows are deleted */
  cleared_player_ids: string[];
  /** Players whose box holds something that isn't valid points */
  invalid_player_ids: string[];
}

/**
 * inputs: the text in each present player's box (player id -> text).
 * saved: the points stored before editing (player id -> points).
 */
export function buildSavePayload(inputs: Record<string, string>, saved: Record<string, number>): SavePayload {
  const scores: ScoreEntry[] = [];
  const cleared: string[] = [];
  const invalid: string[] = [];
  for (const [playerId, text] of Object.entries(inputs)) {
    const parsed = parsePoints(text);
    if (parsed === "invalid") invalid.push(playerId);
    else if (parsed === null) {
      if (playerId in saved) cleared.push(playerId);
    } else scores.push({ player_id: playerId, points: parsed });
  }
  return { scores, cleared_player_ids: cleared, invalid_player_ids: invalid };
}

/** Whether any box now means something other than what is stored ("09" and 9 are the same) */
export function hasUnsavedChanges(inputs: Record<string, string>, saved: Record<string, number>): boolean {
  return Object.entries(inputs).some(([playerId, text]) => {
    const before = playerId in saved ? saved[playerId] : null;
    return parsePoints(text) !== before;
  });
}

/**
 * The server's check before writing. Returns null when the save can go ahead.
 * `reload` is set when the page is out of date (attendance changed since it loaded).
 */
export function checkScoreSave(
  scores: ScoreEntry[],
  clearedIds: string[],
  presentIds: ReadonlySet<string>
): { error: string; reload: boolean } | null {
  if (scores.some((s) => !isValidPoints(s.points))) {
    return { error: "Points must be whole numbers from 0 to 999", reload: false };
  }
  const ids = scores.map((s) => s.player_id);
  if (new Set(ids).size !== ids.length) return { error: "A player is listed twice", reload: false };
  if (ids.some((id) => clearedIds.includes(id))) {
    return { error: "A player can't be scored and cleared at once", reload: false };
  }
  const notPresent = ids.filter((id) => !presentIds.has(id)).length;
  if (notPresent > 0) {
    const who = notPresent === 1 ? "1 player isn't" : `${notPresent} players aren't`;
    return { error: `${who} marked present for this session. Reload and try again.`, reload: true };
  }
  return null;
}

/**
 * A Scores card's state once a save returns. The save ran while the page stayed live, so:
 * - a date change since the click means the result belongs to another page: ignore it;
 * - the card may be gone (a different weekday has other sessions): ignore it;
 * - the boxes may have been edited meanwhile: keep them and only record what was stored,
 *   so the card shows Save again rather than silently reverting the newer typing.
 */
export function applySavedScores<T extends { saved: Record<string, number>; inputs: Record<string, string> }>(
  bySession: Record<string, T>,
  savedFor: { sessionId: string; date: string },
  currentDate: string,
  saved: Record<string, number>
): Record<string, T> {
  const card = bySession[savedFor.sessionId];
  if (savedFor.date !== currentDate || !card) return bySession;
  return { ...bySession, [savedFor.sessionId]: { ...card, saved } };
}
