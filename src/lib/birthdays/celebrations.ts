// Works out where each player's birthday gets celebrated: their first scheduled
// session on or after the birthday. Pure calendar arithmetic on YYYY-MM-DD strings
// (Cairo calendar days), so the server's timezone never shifts a birthday.

import { addDays } from "@/lib/utils/cairo-time";

/** How many days after a birthday a session still counts as its celebration */
export const CELEBRATION_WINDOW_DAYS = 7;

export interface BirthdayPlayer {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  /** Registered phone, for sending birthday wishes on WhatsApp */
  phone: string | null;
}

/** A schedule row: a weekly group session, or a one-off private session on `endDate` */
export interface CelebrationSession {
  id: string;
  kind: "group" | "private";
  /** 0 = Sunday */
  dayOfWeek: number;
  /** HH:MM */
  startTime: string;
  /** First date a weekly session runs (the Cairo day it was created); null = no lower bound */
  startsOn: string | null;
  /** Last date a weekly session runs, or a private session's only date */
  endDate: string | null;
  label: string;
  playerIds: string[];
}

export interface BirthdayEntry {
  player: BirthdayPlayer;
  /** The birthday this entry is for, in the year it falls */
  birthday: string;
  /** The age the player turns on `birthday` */
  age: number;
  /** Where to celebrate; null when the player has no session within the window */
  session: { id: string; date: string; startTime: string; label: string } | null;
}

/** The birthday's date in `year`; Feb 29 falls back to Feb 28 outside leap years */
export function birthdayInYear(dateOfBirth: string, year: number): string {
  const monthDay = dateOfBirth.slice(5, 10);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return `${year}-${monthDay === "02-29" && !isLeap ? "02-28" : monthDay}`;
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Whether the session runs on `date`. `cancelled` holds `${sessionId}_${date}` keys. */
export function occursOn(session: CelebrationSession, date: string, cancelled: Set<string>): boolean {
  if (cancelled.has(`${session.id}_${date}`)) return false;
  if (session.kind === "private") return session.endDate === date;
  if (weekday(date) !== session.dayOfWeek) return false;
  if (session.startsOn && date < session.startsOn) return false;
  if (session.endDate && date > session.endDate) return false;
  return true;
}

/** The player's first session on or after `birthday`, within the window */
function celebrationSession(
  sessions: CelebrationSession[],
  birthday: string,
  cancelled: Set<string>
): BirthdayEntry["session"] {
  for (let i = 0; i <= CELEBRATION_WINDOW_DAYS; i++) {
    const date = addDays(birthday, i);
    const earliest = sessions
      .filter((s) => occursOn(s, date, cancelled))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
    if (earliest) return { id: earliest.id, date, startTime: earliest.startTime, label: earliest.label };
  }
  return null;
}

/**
 * Birthdays to show for the dates `from`..`to` (inclusive): every birthday that falls
 * in that range, plus earlier birthdays whose celebration session falls in it.
 * Players who aren't in any session are skipped.
 */
export function findBirthdays(input: {
  players: BirthdayPlayer[];
  sessions: CelebrationSession[];
  cancelled: Set<string>;
  from: string;
  to: string;
}): BirthdayEntry[] {
  const { players, sessions, cancelled, from, to } = input;
  // A birthday this far back can still have its celebration inside the range
  const earliestBirthday = addDays(from, -CELEBRATION_WINDOW_DAYS);
  const inRange = (date: string) => date >= from && date <= to;

  const entries: BirthdayEntry[] = [];
  for (const player of players) {
    const own = sessions.filter((s) => s.playerIds.includes(player.id));
    if (own.length === 0) continue;

    const birthYear = Number(player.dateOfBirth.slice(0, 4));
    for (let year = Number(earliestBirthday.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
      const birthday = birthdayInYear(player.dateOfBirth, year);
      const age = year - birthYear;
      if (birthday < earliestBirthday || birthday > to || age < 1) continue;

      const session = celebrationSession(own, birthday, cancelled);
      if (inRange(birthday) || (session && inRange(session.date))) {
        entries.push({ player, birthday, age, session });
      }
    }
  }

  return entries.sort(
    (a, b) =>
      (a.session?.date ?? a.birthday).localeCompare(b.session?.date ?? b.birthday) ||
      (a.session?.startTime ?? "").localeCompare(b.session?.startTime ?? "") ||
      a.birthday.localeCompare(b.birthday) ||
      a.player.firstName.localeCompare(b.player.firstName)
  );
}
