// Calendar months for the King of Court leaderboard, written "YYYY-MM".

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The ?month= value when it is a real YYYY-MM, otherwise the fallback (the current month) */
export function parseMonthParam(param: string | undefined, fallback: string): string {
  return param && MONTH_PATTERN.test(param) ? param : fallback;
}

/** The month `by` months after `month` (negative goes back) */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  const year = Math.floor(index / 12);
  const monthNumber = index - year * 12 + 1;
  return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

/** Dates in the month are `from <= session_date < to`; comparing YYYY-MM-DD strings needs no timezone */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
}
