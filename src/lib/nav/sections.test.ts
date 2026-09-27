import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBySection, parseOpenSections, sectionOfKey, toggleSection, withSection } from "./sections";

const NAV = [
  { key: "dashboard" },
  { key: "players", section: "People" },
  { key: "coaches", section: "People" },
  { key: "finances", section: "Finance" },
  { key: "merch", section: "Merch" },
  { key: "merch-analytics", section: "Merch" },
];

test("groupBySection keeps nav order and puts section-less links in their own group", () => {
  assert.deepEqual(
    groupBySection(NAV).map((g) => [g.section, g.items.map((i) => i.key)]),
    [
      [null, ["dashboard"]],
      ["People", ["players", "coaches"]],
      ["Finance", ["finances"]],
      ["Merch", ["merch", "merch-analytics"]],
    ],
  );
});

test("groupBySection starts a new group when a section comes back later in the list", () => {
  const items = [{ key: "a", section: "P" }, { key: "b", section: "F" }, { key: "c", section: "P" }];
  assert.deepEqual(groupBySection(items).map((g) => g.section), ["P", "F", "P"]);
});

test("sectionOfKey finds the section of the current page", () => {
  assert.equal(sectionOfKey(NAV, "merch-analytics"), "Merch");
  assert.equal(sectionOfKey(NAV, "dashboard"), null);
  assert.equal(sectionOfKey(NAV, "missing"), null);
});

test("withSection opens the current page's section without duplicating it", () => {
  assert.deepEqual(withSection(["People"], "Merch"), ["People", "Merch"]);
  assert.deepEqual(withSection(["Merch"], "Merch"), ["Merch"]);
  assert.deepEqual(withSection(["People"], null), ["People"]);
});

test("toggleSection opens a closed section and closes an open one", () => {
  assert.deepEqual(toggleSection(["People"], "Merch"), ["People", "Merch"]);
  assert.deepEqual(toggleSection(["People", "Merch"], "People"), ["Merch"]);
});

test("parseOpenSections reads what was saved, and ignores anything unreadable", () => {
  assert.deepEqual(parseOpenSections('["People","Merch"]'), ["People", "Merch"]);
  assert.deepEqual(parseOpenSections('["People", 3]'), ["People"]);
  assert.equal(parseOpenSections(null), null);
  assert.equal(parseOpenSections("not json"), null);
  assert.equal(parseOpenSections('{"People":true}'), null);
});
