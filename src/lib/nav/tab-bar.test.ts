import { test } from "node:test";
import assert from "node:assert/strict";
import { pagesUnderMore } from "./tab-bar";

const tab = (key: string) => ({ key });

test("pagesUnderMore: every page is a tab, so there's nothing for More", () => {
  const coachMenu = [tab("dashboard"), tab("schedule"), tab("my-groups"), tab("leaderboard"), tab("feedback")];
  assert.deepEqual(pagesUnderMore(coachMenu, coachMenu), []);
});

test("pagesUnderMore: the pages that aren't tabs, in menu order", () => {
  const tabs = [tab("dashboard"), tab("sessions"), tab("leaderboard"), tab("achievements")];
  const menu = [
    tab("dashboard"),
    tab("sessions"),
    tab("private-sessions"),
    tab("leaderboard"),
    tab("achievements"),
    tab("merch"),
    tab("profile"),
  ];
  assert.deepEqual(
    pagesUnderMore(tabs, menu).map((item) => item.key),
    ["private-sessions", "merch", "profile"]
  );
});
