import { test } from "node:test";
import assert from "node:assert/strict";
import { round2, sessionHours } from "./hours";

test("sessionHours: an ordinary evening session", () => {
  assert.equal(sessionHours("18:00", "19:30"), 1.5);
  assert.equal(sessionHours("07:15", "08:30"), 1.25);
});

test("sessionHours: an end of 00:00 is midnight, not the start of the day", () => {
  assert.equal(sessionHours("22:00", "00:00"), 2);
});

test("sessionHours: a session running past midnight wraps", () => {
  assert.equal(sessionHours("23:00", "01:00"), 2);
});

test("sessionHours: accepts Postgres HH:MM:SS times", () => {
  assert.equal(sessionHours("18:00:00", "20:00:00"), 2);
});

test("sessionHours: rounds odd lengths to 2 decimals", () => {
  // 50 minutes = 0.8333…
  assert.equal(sessionHours("18:00", "18:50"), 0.83);
});

test("round2 rounds half up to 2 decimals without float noise", () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(5550), 5550);
});
