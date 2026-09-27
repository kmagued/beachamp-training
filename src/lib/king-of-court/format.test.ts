import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDay, formatMonth, formatTime, joinNames, ordinal } from "./format";

test("ordinal: st/nd/rd/th, with 11-13 always th", () => {
  const cases: [number, string][] = [
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [10, "10th"], [11, "11th"], [12, "12th"],
    [13, "13th"], [21, "21st"], [22, "22nd"], [23, "23rd"], [101, "101st"], [111, "111th"],
  ];
  for (const [n, expected] of cases) assert.equal(ordinal(n), expected);
});

test("formatTime: 12-hour clock from a Postgres TIME", () => {
  assert.equal(formatTime("18:00:00"), "6:00 PM");
  assert.equal(formatTime("00:30:00"), "12:30 AM");
  assert.equal(formatTime("12:15:00"), "12:15 PM");
  assert.equal(formatTime("09:05"), "9:05 AM");
});

test("formatDay: weekday, day and short month", () => {
  assert.equal(formatDay("2026-09-03"), "Thu 3 Sep");
  assert.equal(formatDay("2026-09-28"), "Mon 28 Sep");
  assert.equal(formatDay("2028-02-29"), "Tue 29 Feb");
});

test("formatMonth: short by default, long on request", () => {
  assert.equal(formatMonth("2026-09"), "Sep 2026");
  assert.equal(formatMonth("2026-09", "long"), "September 2026");
  assert.equal(formatMonth("2027-01", "long"), "January 2027");
});

test("joinNames lists co-winners naturally", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Ahmed Kamal"]), "Ahmed Kamal");
  assert.equal(joinNames(["Ahmed Kamal", "Mariam Samir"]), "Ahmed Kamal & Mariam Samir");
  assert.equal(joinNames(["A", "B", "C"]), "A, B & C");
});
