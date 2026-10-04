import { test } from "node:test";
import assert from "node:assert/strict";
import { roleChangeFlags } from "./role-change";

test("roleChangeFlags: a player made admin keeps playing", () => {
  assert.deepEqual(roleChangeFlags("player", "admin"), { is_player: true });
});

test("roleChangeFlags: a coach made admin doesn't start playing", () => {
  assert.deepEqual(roleChangeFlags("coach", "admin"), {});
});

test("roleChangeFlags: back to player, the role covers playing and coach access ends, as before", () => {
  assert.deepEqual(roleChangeFlags("admin", "player"), { is_coach: false, is_player: false });
});

test("roleChangeFlags: made a coach, coach access is on and the player flag is cleared", () => {
  assert.deepEqual(roleChangeFlags("admin", "coach"), { is_coach: true, is_player: false });
  assert.deepEqual(roleChangeFlags("player", "coach"), { is_coach: true, is_player: false });
});
