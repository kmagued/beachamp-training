import { test } from "node:test";
import assert from "node:assert/strict";
import { grandTotal, paidHours, parseRate, payTotal, summarize, type CoachAttendanceRow } from "./summary";

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

test("paidHours: a present row pays its snapshot hours", () => {
  assert.equal(paidHours(row({ hours: 2 })), 2);
});

test("paidHours: absent and excused rows pay nothing", () => {
  assert.equal(paidHours(row({ status: "absent" })), 0);
  assert.equal(paidHours(row({ status: "excused" })), 0);
});

test("paidHours: a row with no snapshot falls back to the session's times", () => {
  assert.equal(paidHours(row({ hours: null, startTime: "20:00", endTime: "22:00" })), 2);
});

test("summarize counts only present sessions", () => {
  const s = summarize([
    row({ date: "2026-09-01", hours: 1.5 }),
    row({ date: "2026-09-02", status: "absent", hours: 1.5 }),
    row({ date: "2026-09-03", status: "excused", hours: 1.5 }),
  ]);
  assert.deepEqual(s, { days: 1, hours: 1.5 });
});

test("summarize: two sessions on one date are one day but both sets of hours", () => {
  const s = summarize([
    row({ date: "2026-09-01", hours: 1.5 }),
    row({ date: "2026-09-01", hours: 1 }),
    row({ date: "2026-09-04", hours: 2 }),
  ]);
  assert.deepEqual(s, { days: 2, hours: 4.5 });
});

test("summarize: a day with only an absent session is not a day worked", () => {
  const s = summarize([row({ date: "2026-09-01", status: "absent" })]);
  assert.deepEqual(s, { days: 0, hours: 0 });
});

test("summarize: no rows is zero", () => {
  assert.deepEqual(summarize([]), { days: 0, hours: 0 });
});

test("summarize rounds the hours total", () => {
  const s = summarize([row({ hours: 0.83 }), row({ date: "2026-09-02", hours: 0.83 }), row({ date: "2026-09-03", hours: 0.84 })]);
  assert.equal(s.hours, 2.5);
});

test("payTotal: hourly pays hours × rate", () => {
  assert.equal(payTotal("hourly", 300, { days: 12, hours: 18.5 }), 5550);
});

test("payTotal: daily pays days × rate", () => {
  assert.equal(payTotal("daily", 800, { days: 9, hours: 13 }), 7200);
});

test("payTotal: no rate means no total", () => {
  assert.equal(payTotal("hourly", null, { days: 3, hours: 4 }), null);
});

test("payTotal: a rate of 0 is a real total of 0", () => {
  assert.equal(payTotal("daily", 0, { days: 3, hours: 4 }), 0);
});

test("payTotal rounds to 2 decimals", () => {
  assert.equal(payTotal("hourly", 333.33, { days: 1, hours: 0.83 }), 276.66);
});

test("parseRate: a typed number, or null when blank or invalid", () => {
  assert.equal(parseRate("300"), 300);
  assert.equal(parseRate(" 250.5 "), 250.5);
  assert.equal(parseRate("0"), 0);
  for (const bad of ["", "  ", "abc", "-5", "Infinity"]) {
    assert.equal(parseRate(bad), null, JSON.stringify(bad));
  }
});

test("grandTotal adds the totals that exist and skips coaches with no rate", () => {
  assert.equal(grandTotal([5550, null, 7200]), 12750);
  assert.equal(grandTotal([0.1, 0.2]), 0.3);
});

test("grandTotal: no rates at all is no total, not 0", () => {
  assert.equal(grandTotal([null, null]), null);
  assert.equal(grandTotal([]), null);
});
