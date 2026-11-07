import { test } from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_COURT_HOURLY_RATE, parseCourtRate, readCourtRateSetting } from "./court-rate";

test("fallback rate is 350 EGP", () => {
  assert.equal(FALLBACK_COURT_HOURLY_RATE, 350);
});

test("readCourtRateSetting: no row falls back", () => {
  assert.equal(readCourtRateSetting(null), 350);
});

test("readCourtRateSetting: a saved rate wins", () => {
  assert.equal(readCourtRateSetting({ rate: 400 }), 400);
});

test("readCourtRateSetting: a malformed row falls back", () => {
  assert.equal(readCourtRateSetting({ rate: "abc" }), 350);
  assert.equal(readCourtRateSetting({ rate: 0 }), 350);
  assert.equal(readCourtRateSetting({ rate: -10 }), 350);
  assert.equal(readCourtRateSetting({}), 350);
});

test("parseCourtRate: accepts positive numbers and numeric strings", () => {
  assert.equal(parseCourtRate(350), 350);
  assert.equal(parseCourtRate(" 412.5 "), 412.5);
});

test("parseCourtRate: rejects blanks, zero, negatives and junk", () => {
  assert.equal(parseCourtRate(""), null);
  assert.equal(parseCourtRate("0"), null);
  assert.equal(parseCourtRate(-5), null);
  assert.equal(parseCourtRate("abc"), null);
  assert.equal(parseCourtRate(Infinity), null);
  assert.equal(parseCourtRate(null), null);
});
