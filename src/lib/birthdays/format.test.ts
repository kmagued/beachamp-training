import { test } from "node:test";
import assert from "node:assert/strict";
import { ageLine, shortDate, timeLabel } from "./format";

test("shortDate: weekday, day and month, without timezone drift", () => {
  assert.equal(shortDate("2026-10-05"), "Mon 5 Oct");
  assert.equal(shortDate("2027-01-02"), "Sat 2 Jan");
});

test("timeLabel: 12-hour clock", () => {
  assert.equal(timeLabel("18:00"), "6:00 PM");
  assert.equal(timeLabel("08:30"), "8:30 AM");
  assert.equal(timeLabel("12:15"), "12:15 PM");
  assert.equal(timeLabel("00:00"), "12:00 AM");
});

test("ageLine: an upcoming birthday", () => {
  assert.equal(ageLine({ birthday: "2026-10-05", age: 24 }, "2026-10-03"), "turns 24 on Mon 5 Oct");
});

test("ageLine: a birthday today", () => {
  assert.equal(ageLine({ birthday: "2026-10-05", age: 24 }, "2026-10-05"), "turns 24 today");
});

test("ageLine: a birthday that has passed", () => {
  assert.equal(ageLine({ birthday: "2026-10-05", age: 24 }, "2026-10-08"), "turned 24 on Mon 5 Oct");
});
