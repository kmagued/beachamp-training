import { test } from "node:test";
import assert from "node:assert/strict";
import type { CoachAttendanceRow } from "./summary";
import { buildPaySheets, uniqueSheetNames, type PaySheetCoach } from "./workbook";

function row(over: Partial<CoachAttendanceRow> = {}): CoachAttendanceRow {
  return {
    date: "2026-09-01",
    status: "present",
    hours: 1.5,
    startTime: "18:00",
    endTime: "19:30",
    sessionLabel: "U14 A",
    location: "Court 2",
    notes: null,
    ...over,
  };
}

function coach(over: Partial<PaySheetCoach> = {}): PaySheetCoach {
  return { name: "Ahmed Ali", payType: "hourly", rate: 300, rows: [row()], ...over };
}

// ── Sheet names ──

test("uniqueSheetNames strips the characters Excel forbids", () => {
  assert.deepEqual(uniqueSheetNames(["A/B [C]: *D?\\"]), ["AB C D"]);
});

test("uniqueSheetNames keeps names within Excel's 31 characters", () => {
  const [name] = uniqueSheetNames(["Mohamed Abdelrahman El-Sayed Mostafa"]);
  assert.equal(name, "Mohamed Abdelrahman El-Sayed Mo");
  assert.equal(name.length, 31);
});

test("uniqueSheetNames numbers duplicates, ignoring case", () => {
  assert.deepEqual(uniqueSheetNames(["Sara Nabil", "sara nabil", "Sara Nabil"]), ["Sara Nabil", "sara nabil (2)", "Sara Nabil (3)"]);
});

test("uniqueSheetNames: a numbered long name still fits in 31 characters", () => {
  const long = "Mohamed Abdelrahman El-Sayed Mostafa";
  const [, second] = uniqueSheetNames([long, long]);
  assert.equal(second, "Mohamed Abdelrahman El-Saye (2)");
  assert.ok(second.length <= 31);
});

test("uniqueSheetNames: a coach called Summary doesn't clash with the Summary sheet", () => {
  assert.deepEqual(uniqueSheetNames(["Summary"]), ["Summary (2)"]);
});

test("uniqueSheetNames: a name with nothing usable left becomes Coach", () => {
  assert.deepEqual(uniqueSheetNames(["//??", "  "]), ["Coach", "Coach (2)"]);
});

test("uniqueSheetNames: Excel rejects leading or trailing apostrophes", () => {
  assert.deepEqual(uniqueSheetNames(["'Omar'"]), ["Omar"]);
});

// ── Summary sheet ──

test("buildPaySheets puts the Summary first, then one sheet per coach in name order", () => {
  const sheets = buildPaySheets({
    month: "2026-09",
    coaches: [coach({ name: "Sara Nabil" }), coach({ name: "Ahmed Ali" })],
  });
  assert.deepEqual(sheets.map((s) => s.name), ["Summary", "Ahmed Ali", "Sara Nabil"]);
});

test("Summary: title, header, a row per coach and a TOTAL row", () => {
  const [summary] = buildPaySheets({
    month: "2026-09",
    coaches: [
      coach({ name: "Sara Nabil", payType: "daily", rate: 800, rows: [row({ date: "2026-09-01" }), row({ date: "2026-09-02" })] }),
      coach({ name: "Ahmed Ali", payType: "hourly", rate: 300, rows: [row({ hours: 2 }), row({ date: "2026-09-02", hours: 1 })] }),
    ],
  });
  assert.deepEqual(summary.rows, [
    ["Coach pay — September 2026"],
    [],
    ["Coach", "Days", "Hours", "Pay type", "Rate (EGP)", "Total (EGP)"],
    ["Ahmed Ali", 2, 3, "Hourly", 300, 900],
    ["Sara Nabil", 2, 3, "Daily", 800, 1600],
    ["TOTAL", 4, 6, null, null, 2500],
  ]);
});

test("Summary: a coach with no rate has blank Rate and Total and is left out of the grand total", () => {
  const [summary] = buildPaySheets({
    month: "2026-09",
    coaches: [coach({ name: "Ahmed Ali", rate: 300 }), coach({ name: "Omar Hassan", rate: null })],
  });
  assert.deepEqual(summary.rows[4], ["Omar Hassan", 1, 1.5, "Hourly", null, null]);
  assert.deepEqual(summary.rows[5], ["TOTAL", 2, 3, null, null, 450]);
});

test("Summary: no rates at all leaves the grand total blank", () => {
  const [summary] = buildPaySheets({ month: "2026-09", coaches: [coach({ rate: null })] });
  assert.deepEqual(summary.rows.at(-1), ["TOTAL", 1, 1.5, null, null, null]);
});

// ── Coach sheets ──

test("coach sheet: every attendance row, sorted by date then time, absent rows paying 0", () => {
  const [, sheet] = buildPaySheets({
    month: "2026-09",
    coaches: [
      coach({
        rows: [
          row({ date: "2026-09-03", status: "absent", sessionLabel: "Private – Mona Adel", startTime: "20:00", endTime: "21:00", hours: 1, location: "Court 1", notes: "sick" }),
          row({ date: "2026-09-01", startTime: "20:00", endTime: "21:00", hours: 1, location: null }),
          row({ date: "2026-09-01", startTime: "18:00", endTime: "19:30", hours: 1.5 }),
        ],
      }),
    ],
  });
  assert.deepEqual(sheet.rows.slice(0, 4), [
    ["Date", "Day", "Session", "Time", "Location", "Status", "Hours", "Notes"],
    ["2026-09-01", "Tue", "U14 A", "18:00–19:30", "Court 2", "present", 1.5, null],
    ["2026-09-01", "Tue", "U14 A", "20:00–21:00", null, "present", 1, null],
    ["2026-09-03", "Thu", "Private – Mona Adel", "20:00–21:00", "Court 1", "absent", 0, "sick"],
  ]);
});

test("coach sheet ends with the month's totals", () => {
  const [, sheet] = buildPaySheets({
    month: "2026-09",
    coaches: [coach({ payType: "daily", rate: 800, rows: [row(), row({ date: "2026-09-02", hours: 2 })] })],
  });
  assert.deepEqual(sheet.rows.slice(-6), [
    [],
    ["Days worked", 2],
    ["Paid hours", 3.5],
    ["Pay type", "Daily"],
    ["Rate (EGP)", 800],
    ["Total (EGP)", 1600],
  ]);
});

test("coach sheet: no attendance shows a placeholder row and zero totals", () => {
  const [, sheet] = buildPaySheets({ month: "2026-09", coaches: [coach({ rate: null, rows: [] })] });
  assert.deepEqual(sheet.rows, [
    ["Date", "Day", "Session", "Time", "Location", "Status", "Hours", "Notes"],
    ["No attendance logged"],
    [],
    ["Days worked", 0],
    ["Paid hours", 0],
    ["Pay type", "Hourly"],
    ["Rate (EGP)", null],
    ["Total (EGP)", null],
  ]);
});

test("every sheet sets a width for each of its columns", () => {
  const [summary, sheet] = buildPaySheets({ month: "2026-09", coaches: [coach()] });
  assert.equal(summary.cols.length, 6);
  assert.equal(sheet.cols.length, 8);
});
