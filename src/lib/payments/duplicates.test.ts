import { test } from "node:test";
import assert from "node:assert/strict";
import { cairoTimeLabel, sameDayDuplicate } from "./duplicates";

// 00:52 on Sat 4 Oct in Cairo (UTC+3), when the 700 EGP private session payment was first recorded
const firstRecorded = { amount: 700, package_id: "private", created_at: "2026-10-03T21:52:36Z" };
const candidate = { amount: 700, package_id: "private" };

test("sameDayDuplicate: the same package and amount recorded earlier the same day", () => {
  assert.equal(sameDayDuplicate([firstRecorded], candidate, new Date("2026-10-03T21:53:05Z")), firstRecorded);
});

test("sameDayDuplicate: a different amount or package is a different payment", () => {
  const now = new Date("2026-10-03T21:53:05Z");
  assert.equal(sameDayDuplicate([firstRecorded], { amount: 400, package_id: "private" }, now), null);
  assert.equal(sameDayDuplicate([firstRecorded], { amount: 700, package_id: "monthly" }, now), null);
});

test("sameDayDuplicate: the day is Cairo's, so 00:52 and 02:00 Cairo are the same day though UTC dates differ", () => {
  assert.equal(sameDayDuplicate([firstRecorded], candidate, new Date("2026-10-03T23:00:00Z")), firstRecorded);
});

test("sameDayDuplicate: a payment from the Cairo day before isn't a duplicate", () => {
  // 23:00 on Fri 3 Oct in Cairo
  const yesterday = { ...firstRecorded, created_at: "2026-10-03T20:00:00Z" };
  assert.equal(sameDayDuplicate([yesterday], candidate, new Date("2026-10-03T21:53:05Z")), null);
});

test("sameDayDuplicate: the most recent match, when there are several", () => {
  const second = { ...firstRecorded, created_at: "2026-10-03T21:53:05Z" };
  assert.equal(sameDayDuplicate([firstRecorded, second], candidate, new Date("2026-10-03T21:54:00Z")), second);
});

test("cairoTimeLabel: the time of day in Cairo, 24-hour", () => {
  assert.equal(cairoTimeLabel("2026-10-03T21:52:36Z"), "00:52");
  assert.equal(cairoTimeLabel("2026-01-15T10:05:00Z"), "12:05");
});
