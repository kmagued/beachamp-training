import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBadge } from "./validate";

const base = { name: "Court Regular", icon: "shield-check", measure: "sessions_attended", threshold: "25", credits: "50" };

test("validateBadge: a good badge comes back trimmed and as numbers", () => {
  assert.deepEqual(validateBadge({ ...base, name: "  Court Regular " }), {
    ok: true,
    value: { name: "Court Regular", icon: "shield-check", measure: "sessions_attended", threshold: 25, credits: 50 },
  });
});

test("validateBadge: blank credits mean 0", () => {
  const res = validateBadge({ ...base, credits: "" });
  assert.equal(res.ok && res.value.credits, 0);
});

test("validateBadge: the name is required and at most 40 characters", () => {
  assert.deepEqual(validateBadge({ ...base, name: "   " }), { ok: false, field: "name", error: "Give the badge a name" });
  assert.deepEqual(validateBadge({ ...base, name: "x".repeat(41) }), {
    ok: false,
    field: "name",
    error: "Keep the name to 40 characters",
  });
  assert.equal(validateBadge({ ...base, name: "x".repeat(40) }).ok, true);
});

test("validateBadge: the icon and measure must be ones we offer", () => {
  assert.deepEqual(validateBadge({ ...base, icon: "cat" }), { ok: false, field: "icon", error: "Pick an icon" });
  assert.deepEqual(validateBadge({ ...base, measure: "goals" }), { ok: false, field: "measure", error: "Pick what the badge measures" });
});

test("validateBadge: the number must be a whole number in range; streaks start at 2", () => {
  assert.deepEqual(validateBadge({ ...base, threshold: "0" }), {
    ok: false,
    field: "threshold",
    error: "Enter a whole number from 1 to 1000",
  });
  assert.deepEqual(validateBadge({ ...base, threshold: "2.5" }), {
    ok: false,
    field: "threshold",
    error: "Enter a whole number from 1 to 1000",
  });
  assert.deepEqual(validateBadge({ ...base, threshold: "1001" }), {
    ok: false,
    field: "threshold",
    error: "Enter a whole number from 1 to 1000",
  });
  assert.deepEqual(validateBadge({ ...base, threshold: "" }), {
    ok: false,
    field: "threshold",
    error: "Enter a whole number from 1 to 1000",
  });
  assert.deepEqual(validateBadge({ ...base, measure: "attendance_streak", threshold: "1" }), {
    ok: false,
    field: "threshold",
    error: "Enter a whole number from 2 to 1000",
  });
  assert.equal(validateBadge({ ...base, measure: "attendance_streak", threshold: "2" }).ok, true);
});

test("validateBadge: credits are a whole number from 0 to 10000", () => {
  for (const credits of ["-1", "10001", "1.5", "abc"]) {
    assert.deepEqual(validateBadge({ ...base, credits }), {
      ok: false,
      field: "credits",
      error: "Enter a whole number of credits from 0 to 10000",
    });
  }
  assert.equal(validateBadge({ ...base, credits: "10000" }).ok, true);
});

test("validateBadge: editing can't change the measure", () => {
  assert.deepEqual(validateBadge({ ...base, measure: "monthly_wins" }, { currentMeasure: "sessions_attended" }), {
    ok: false,
    field: "measure",
    error: "A badge's measure can't be changed",
  });
  assert.equal(validateBadge(base, { currentMeasure: "sessions_attended" }).ok, true);
});
