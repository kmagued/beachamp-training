import { test } from "node:test";
import assert from "node:assert/strict";
import { monthRange, parseMonthParam, shiftMonth } from "./month";

test("parseMonthParam keeps a valid YYYY-MM and falls back otherwise", () => {
  assert.equal(parseMonthParam("2026-09", "2026-10"), "2026-09");
  for (const bad of ["2026-13", "2026-00", "2026-9", "abc", "", undefined, "2026-09-01"]) {
    assert.equal(parseMonthParam(bad, "2026-10"), "2026-10", String(bad));
  }
});

test("shiftMonth crosses year boundaries both ways", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(shiftMonth("2026-09", 0), "2026-09");
  assert.equal(shiftMonth("2026-09", -13), "2025-08");
});

test("monthRange: the 1st of the month to the 1st of the next, end exclusive", () => {
  assert.deepEqual(monthRange("2026-09"), { from: "2026-09-01", to: "2026-10-01" });
  assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
});

test("monthRange: the last day is inside the month, the next month's 1st is not", () => {
  const inside = (month: string, date: string) => {
    const { from, to } = monthRange(month);
    return date >= from && date < to;
  };
  assert.equal(inside("2026-09", "2026-09-30"), true);
  assert.equal(inside("2026-09", "2026-10-01"), false);
  assert.equal(inside("2026-09", "2026-08-31"), false);
  assert.equal(inside("2028-02", "2028-02-29"), true);
  assert.equal(inside("2026-12", "2026-12-31"), true);
});
