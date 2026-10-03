// Display strings for birthday reminders. Dates are YYYY-MM-DD calendar days, formatted
// in UTC so the viewer's timezone can't move them to a neighbouring day.

import type { BirthdayEntry } from "./celebrations";

const shortDateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Mon 5 Oct" */
export function shortDate(date: string): string {
  return shortDateFmt.format(new Date(`${date}T00:00:00Z`)).replace(",", "");
}

/** "18:00" → "6:00 PM" */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

/** "turns 24 on Mon 5 Oct", "turns 24 today" or "turned 24 on Mon 5 Oct", relative to `today` */
export function ageLine(entry: Pick<BirthdayEntry, "birthday" | "age">, today: string): string {
  if (entry.birthday === today) return `turns ${entry.age} today`;
  const verb = entry.birthday > today ? "turns" : "turned";
  return `${verb} ${entry.age} on ${shortDate(entry.birthday)}`;
}
