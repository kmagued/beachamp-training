import { test } from "node:test";
import assert from "node:assert/strict";
import { fitFontSize, shareFileName, shareText, slugify, type ShareSubject } from "./share";

const award: ShareSubject = {
  kind: "award",
  place: 1,
  groupName: "Women's Team",
  month: "2026-09",
  points: 142,
  sessions: 8,
  playerName: "Talia Tawfik",
};

const badge: ShareSubject = {
  kind: "badge",
  name: "Court Regular",
  icon: "shield-check",
  description: "Attended 25 sessions",
  earnedOn: "2026-09-25",
  playerName: "Talia Tawfik",
};

test("shareText: an award names the place, group and month; never a possessive group name", () => {
  assert.equal(shareText(award), "1st place in the Women's Team King of Court for September 2026 · Beachamp Academy");
  assert.equal(
    shareText({ ...award, place: 2, groupName: "Juniors" }),
    "2nd place in the Juniors King of Court for September 2026 · Beachamp Academy"
  );
});

test("shareText: a badge names the badge and what it took", () => {
  assert.equal(shareText(badge), "I earned the Court Regular badge at Beachamp Academy · Attended 25 sessions");
});

test("shareFileName: lowercase ASCII, safe on every phone", () => {
  assert.equal(shareFileName(award), "beachamp-1st-place-september-2026.jpg");
  assert.equal(shareFileName({ ...award, place: 2, month: "2026-08" }), "beachamp-2nd-place-august-2026.jpg");
  assert.equal(shareFileName(badge), "beachamp-court-regular-badge.jpg");
  assert.equal(shareFileName({ ...badge, name: "Iron Streak! (8×)" }), "beachamp-iron-streak-8-badge.jpg");
});

test("slugify: accents dropped, punctuation collapsed, never empty", () => {
  assert.equal(slugify("Café  Champion"), "cafe-champion");
  assert.equal(slugify("--Top--"), "top");
  assert.equal(slugify("🏆🏆"), "achievement");
});

test("fitFontSize: the largest size that fits, down to the minimum", () => {
  // A fake measure: each of 10 characters is half the font size wide
  const measure = (size: number) => 10 * size * 0.5;
  assert.equal(fitFontSize(measure, 1000, 120, 40), 120, "fits at the starting size");
  assert.equal(fitFontSize(measure, 400, 120, 40), 80, "shrinks until it fits");
  assert.equal(fitFontSize(measure, 100, 120, 40), 40, "never below the minimum");
});
