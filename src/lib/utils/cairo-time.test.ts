import { test } from "node:test";
import assert from "node:assert/strict";
import { cairoDayKey, isFutureCairoDate } from "./cairo-time";

test("isFutureCairoDate: today in Cairo is not the future, even before UTC reaches the same day", () => {
  // 00:30 on 3 Oct in Cairo (UTC+3) is still 2 Oct in UTC
  const justAfterCairoMidnight = new Date("2026-10-02T21:30:00Z");
  assert.equal(isFutureCairoDate("2026-10-03", justAfterCairoMidnight), false);
  assert.equal(isFutureCairoDate("2026-10-02", justAfterCairoMidnight), false);
  assert.equal(isFutureCairoDate("2026-10-04", justAfterCairoMidnight), true);
});

test("isFutureCairoDate: late in the Cairo day, tomorrow is still the future", () => {
  // 23:59 on 2 Oct in Cairo
  const lateEvening = new Date("2026-10-02T20:59:00Z");
  assert.equal(isFutureCairoDate("2026-10-02", lateEvening), false);
  assert.equal(isFutureCairoDate("2026-10-03", lateEvening), true);
});

test("isFutureCairoDate: in winter (UTC+2) the day turns at 22:00 UTC", () => {
  assert.equal(isFutureCairoDate("2026-12-16", new Date("2026-12-15T21:59:00Z")), true);
  assert.equal(isFutureCairoDate("2026-12-16", new Date("2026-12-15T22:00:00Z")), false);
});

test("cairoDayKey: a timestamp just after Cairo midnight is already the next day", () => {
  // 00:30 on 3 Oct in Cairo (UTC+3) is still 2 Oct in UTC
  assert.equal(cairoDayKey(new Date("2026-10-02T21:30:00Z")), "2026-10-03");
  assert.equal(cairoDayKey(new Date("2026-10-02T20:59:00Z")), "2026-10-02");
});
