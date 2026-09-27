import { test } from "node:test";
import assert from "node:assert/strict";
import { egp, formatDelta, formatRange, formatShare } from "./format";

test("egp rounds to whole pounds with thousands separators", () => {
  assert.equal(egp(1234.6), "1,235 EGP");
  assert.equal(egp(0), "0 EGP");
});

test("formatShare: whole percents, with <1% for small but non-zero shares", () => {
  assert.equal(formatShare(0.4737), "47%");
  assert.equal(formatShare(0.004), "<1%");
  assert.equal(formatShare(0), "0%");
  assert.equal(formatShare(1), "100%");
});

test("formatDelta: signed whole percents, flat when it rounds to 0, a dash when there's nothing to compare", () => {
  assert.deepEqual(formatDelta(0.184), { text: "▲ 18%", direction: "up" });
  assert.deepEqual(formatDelta(-0.052), { text: "▼ 5%", direction: "down" });
  assert.deepEqual(formatDelta(0.003), { text: "0%", direction: "flat" });
  assert.deepEqual(formatDelta(null), { text: "—", direction: "none" });
});

test("formatRange names the year once when both ends share it", () => {
  assert.equal(formatRange({ from: "2026-03-28", to: "2026-06-27" }), "Mar 28 – Jun 27, 2026");
  assert.equal(formatRange({ from: "2025-12-20", to: "2026-01-05" }), "Dec 20, 2025 – Jan 5, 2026");
  assert.equal(formatRange({ from: "2026-09-27", to: "2026-09-27" }), "Sep 27, 2026");
});
