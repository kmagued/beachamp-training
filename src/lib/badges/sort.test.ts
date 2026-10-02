import { test } from "node:test";
import assert from "node:assert/strict";
import { sortBadges } from "./sort";

const badge = (id: string, created_at: string, earned_on: string | null) => ({ id, created_at, earned_on });

test("sortBadges: earned first, newest earned first; then locked in the order they were created", () => {
  const sorted = sortBadges([
    badge("locked-new", "2026-10-03T10:00:00Z", null),
    badge("earned-old", "2026-10-01T10:00:00Z", "2026-10-05"),
    badge("locked-old", "2026-10-01T09:00:00Z", null),
    badge("earned-new", "2026-10-02T10:00:00Z", "2026-10-20"),
  ]);
  assert.deepEqual(sorted.map((b) => b.id), ["earned-new", "earned-old", "locked-old", "locked-new"]);
});

test("sortBadges: two earned on the same day keep creation order; the input isn't changed", () => {
  const input = [badge("b", "2026-10-02T00:00:00Z", "2026-10-05"), badge("a", "2026-10-01T00:00:00Z", "2026-10-05")];
  assert.deepEqual(sortBadges(input).map((b) => b.id), ["a", "b"]);
  assert.deepEqual(input.map((b) => b.id), ["b", "a"]);
});
