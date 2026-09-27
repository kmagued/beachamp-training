import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPoints, parsePoints } from "./points";

test("parsePoints: blank means the player didn't play", () => {
  assert.equal(parsePoints(""), null);
  assert.equal(parsePoints("   "), null);
});

test("parsePoints: whole numbers 0-999, surrounding spaces and leading zeros allowed", () => {
  assert.equal(parsePoints("0"), 0);
  assert.equal(parsePoints("12"), 12);
  assert.equal(parsePoints(" 7 "), 7);
  assert.equal(parsePoints("07"), 7);
  assert.equal(parsePoints("999"), 999);
});

test("parsePoints: Eastern Arabic and Persian digits (Arabic phone keyboards) read as 0-9", () => {
  assert.equal(parsePoints("١٢"), 12);
  assert.equal(parsePoints("٠"), 0);
  assert.equal(parsePoints("٩٩٩"), 999);
  assert.equal(parsePoints("۱۲"), 12);
});

test("parsePoints: anything else is invalid", () => {
  for (const bad of ["1000", "-1", "+5", "7.5", "7.0", "1e2", "abc", "5 pts", "1 2", "0x1", "١٠٠٠"]) {
    assert.equal(parsePoints(bad), "invalid", bad);
  }
});

test("isValidPoints: the server's check on numbers sent by the client", () => {
  assert.equal(isValidPoints(0), true);
  assert.equal(isValidPoints(999), true);
  for (const bad of [-1, 1000, 2.5, NaN, Infinity, "5", null, undefined]) {
    assert.equal(isValidPoints(bad), false, String(bad));
  }
});
