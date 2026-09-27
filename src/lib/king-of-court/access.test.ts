import { test } from "node:test";
import assert from "node:assert/strict";
import { groupsForViewer, groupsToShow, openingGroup, type GroupRow } from "./access";

/** A group row; defaults to active and on the leaderboard */
function g(id: string, extra: Partial<GroupRow> = {}): GroupRow {
  return { id, name: id.toUpperCase(), level: "mixed", is_active: true, in_leaderboard: true, ...extra };
}

test("groupsForViewer: admins (no restriction) see every group on the leaderboard", () => {
  const groups = [g("a"), g("private", { in_leaderboard: false }), g("old", { is_active: false })];
  assert.deepEqual(groupsForViewer(groups, null).map((x) => x.id), ["a", "old"]);
});

test("groupsForViewer: coaches and players see only their own groups", () => {
  assert.deepEqual(groupsForViewer([g("a"), g("b"), g("c")], new Set(["b"])).map((x) => x.id), ["b"]);
});

test("groupsForViewer: belonging to an excluded group (Private Session) doesn't reveal it", () => {
  const groups = [g("a"), g("private", { in_leaderboard: false })];
  assert.deepEqual(groupsForViewer(groups, new Set(["a", "private"])).map((x) => x.id), ["a"]);
});

test("groupsForViewer: someone in no group gets no tabs", () => {
  assert.deepEqual(groupsForViewer([g("a")], new Set()), []);
});

test("groupsToShow: active groups, plus inactive ones that still have scores that month", () => {
  const shown = groupsToShow([g("a"), g("old", { is_active: false }), g("gone", { is_active: false })], new Set(["old"]));
  assert.deepEqual(shown, [
    { id: "a", name: "A", level: "mixed" },
    { id: "old", name: "OLD", level: "mixed" },
  ]);
});

test("openingGroup: the requested tab when it is shown", () => {
  assert.equal(openingGroup(["a", "b"], new Set(["a"]), "b"), "b");
});

test("openingGroup: otherwise the first group with scores, else the first group", () => {
  assert.equal(openingGroup(["a", "b", "c"], new Set(["c"]), null), "c");
  assert.equal(openingGroup(["a", "b"], new Set(), null), "a");
  assert.equal(openingGroup([], new Set(), null), null);
});

test("openingGroup: a tab that isn't shown this month (e.g. after changing month) falls back", () => {
  assert.equal(openingGroup(["a", "b"], new Set(["b"]), "old"), "b");
});
