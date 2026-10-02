import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBadge, type BadgeInput } from "./validate";

const base: BadgeInput = {
  name: "Court Regular",
  icon: "shield-check",
  measure: "sessions_attended",
  tiers: [
    { threshold: "10", credits: "20" },
    { threshold: "25", credits: "50" },
  ],
};

test("validateBadge: a good badge comes back trimmed, with its tiers as numbers", () => {
  assert.deepEqual(validateBadge({ ...base, name: "  Court Regular " }), {
    ok: true,
    value: {
      name: "Court Regular",
      icon: "shield-check",
      measure: "sessions_attended",
      tiers: [
        { threshold: 10, credits: 20 },
        { threshold: 25, credits: 50 },
      ],
    },
  });
});

test("validateBadge: blank credits mean 0", () => {
  const res = validateBadge({ ...base, tiers: [{ threshold: "10", credits: "" }] });
  assert.deepEqual(res.ok && res.value.tiers, [{ threshold: 10, credits: 0 }]);
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
  assert.deepEqual(validateBadge({ ...base, measure: "goals" }), {
    ok: false,
    field: "measure",
    error: "Pick what the badge measures",
  });
});

test("validateBadge: 1 to 5 tiers", () => {
  assert.deepEqual(validateBadge({ ...base, tiers: [] }), { ok: false, field: "tiers", error: "Add at least one tier" });
  const six = [1, 2, 3, 4, 5, 6].map((n) => ({ threshold: String(n), credits: "0" }));
  assert.deepEqual(validateBadge({ ...base, tiers: six }), { ok: false, field: "tiers", error: "A badge has at most 5 tiers" });
  const five = six.slice(0, 5);
  assert.equal(validateBadge({ ...base, tiers: five }).ok, true);
});

test("validateBadge: each number is a whole number in range; a streak starts at 2", () => {
  for (const threshold of ["0", "2.5", "1001", "", "ten"]) {
    assert.deepEqual(validateBadge({ ...base, tiers: [{ threshold, credits: "0" }] }), {
      ok: false,
      field: "tiers",
      tier: 0,
      error: "Enter a whole number from 1 to 1000",
    });
  }
  assert.deepEqual(validateBadge({ ...base, measure: "attendance_streak", tiers: [{ threshold: "1", credits: "0" }] }), {
    ok: false,
    field: "tiers",
    tier: 0,
    error: "Enter a whole number from 2 to 1000",
  });
  assert.equal(validateBadge({ ...base, measure: "attendance_streak", tiers: [{ threshold: "2", credits: "0" }] }).ok, true);
});

test("validateBadge: each tier needs a higher number than the one below, naming both", () => {
  assert.deepEqual(
    validateBadge({
      ...base,
      tiers: [
        { threshold: "10", credits: "0" },
        { threshold: "25", credits: "0" },
        { threshold: "25", credits: "0" },
      ],
    }),
    { ok: false, field: "tiers", tier: 2, error: "Gold needs a higher number than Silver" }
  );
});

test("validateBadge: credits are a whole number from 0 to 10000, per tier", () => {
  for (const credits of ["-1", "10001", "1.5", "abc"]) {
    assert.deepEqual(
      validateBadge({
        ...base,
        tiers: [
          { threshold: "10", credits: "0" },
          { threshold: "25", credits },
        ],
      }),
      { ok: false, field: "tiers", tier: 1, error: "Enter a whole number of credits from 0 to 10000" }
    );
  }
});

test("validateBadge: editing can't change the measure", () => {
  assert.deepEqual(validateBadge({ ...base, measure: "monthly_wins" }, { currentMeasure: "sessions_attended" }), {
    ok: false,
    field: "measure",
    error: "A badge's measure can't be changed",
  });
  assert.equal(validateBadge(base, { currentMeasure: "sessions_attended" }).ok, true);
});
