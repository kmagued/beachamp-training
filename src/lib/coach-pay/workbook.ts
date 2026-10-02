// The coach pay Excel file as plain cell rows: a Summary sheet, then one sheet per coach.
// Writing the file is `exportSheetsToExcel`'s job; this only decides what goes in it.

import { formatMonth } from "@/lib/king-of-court/format";
import type { ExcelCell, ExcelSheet } from "@/lib/utils/export-excel";
import { round2 } from "./hours";
import { grandTotal, paidHours, payTotal, summarize, type CoachAttendanceRow, type PayType } from "./summary";

type Cell = ExcelCell;
type Sheet = ExcelSheet;

export interface PaySheetCoach {
  name: string;
  payType: PayType;
  /** null when the admin left the rate blank */
  rate: number | null;
  rows: CoachAttendanceRow[];
}

const SUMMARY = "Summary";
/** Excel's limit on a sheet name */
const MAX_SHEET_NAME = 31;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PAY_TYPE_LABEL: Record<PayType, string> = { hourly: "Hourly", daily: "Daily" };

/**
 * Names Excel will accept, one per input and in the same order: no `[]:*?/\`, no
 * apostrophe at either end, at most 31 characters, and unique ignoring case (including
 * against the Summary sheet).
 */
export function uniqueSheetNames(names: string[]): string[] {
  const taken = new Set([SUMMARY.toLowerCase()]);
  return names.map((raw) => {
    const cleaned = raw.replace(/[[\]:*?/\\]/g, "").trim().replace(/^'+|'+$/g, "").trim();
    const base = (cleaned || "Coach").slice(0, MAX_SHEET_NAME).trimEnd();
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, MAX_SHEET_NAME - suffix.length).trimEnd() + suffix;
    }
    taken.add(name.toLowerCase());
    return name;
  });
}

/** Read in UTC so the viewer's timezone can't shift the day */
function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function byDateThenTime(a: CoachAttendanceRow, b: CoachAttendanceRow): number {
  return a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
}

export function buildPaySheets(input: { month: string; coaches: PaySheetCoach[] }): Sheet[] {
  const coaches = [...input.coaches]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const summary = summarize(c.rows);
      return { ...c, summary, total: payTotal(c.payType, c.rate, summary) };
    });

  const summarySheet: Sheet = {
    name: SUMMARY,
    rows: [
      [`Coach pay — ${formatMonth(input.month, "long")}`],
      [],
      ["Coach", "Days", "Hours", "Pay type", "Rate (EGP)", "Total (EGP)"],
      ...coaches.map((c): Cell[] => [c.name, c.summary.days, c.summary.hours, PAY_TYPE_LABEL[c.payType], c.rate, c.total]),
      [
        "TOTAL",
        coaches.reduce((sum, c) => sum + c.summary.days, 0),
        round2(coaches.reduce((sum, c) => sum + c.summary.hours, 0)),
        null,
        null,
        grandTotal(coaches.map((c) => c.total)),
      ],
    ],
    cols: [26, 8, 8, 10, 12, 14],
  };

  const names = uniqueSheetNames(coaches.map((c) => c.name));
  const coachSheets = coaches.map((c, i): Sheet => {
    const attendance: Cell[][] = [...c.rows]
      .sort(byDateThenTime)
      .map((r) => [r.date, weekday(r.date), r.sessionLabel, `${r.startTime}–${r.endTime}`, r.location, r.status, paidHours(r), r.notes]);
    return {
      name: names[i],
      rows: [
        ["Date", "Day", "Session", "Time", "Location", "Status", "Hours", "Notes"],
        ...(attendance.length > 0 ? attendance : [["No attendance logged"]]),
        [],
        ["Days worked", c.summary.days],
        ["Paid hours", c.summary.hours],
        ["Pay type", PAY_TYPE_LABEL[c.payType]],
        ["Rate (EGP)", c.rate],
        ["Total (EGP)", c.total],
      ],
      cols: [12, 6, 26, 13, 14, 9, 7, 30],
    };
  });

  return [summarySheet, ...coachSheets];
}
