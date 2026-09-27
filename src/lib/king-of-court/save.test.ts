import { test } from "node:test";
import assert from "node:assert/strict";
import { applySavedScores, buildSavePayload, checkScoreSave, hasUnsavedChanges } from "./save";

test("buildSavePayload: typed boxes become scores, blank boxes stay out", () => {
  const p = buildSavePayload({ a: "12", b: "0", c: "" }, {});
  assert.deepEqual(p.scores, [{ player_id: "a", points: 12 }, { player_id: "b", points: 0 }]);
  assert.deepEqual(p.cleared_player_ids, []);
  assert.deepEqual(p.invalid_player_ids, []);
});

test("buildSavePayload: blanking a saved score clears it", () => {
  const p = buildSavePayload({ a: "", b: "4" }, { a: 9, b: 3 });
  assert.deepEqual(p.scores, [{ player_id: "b", points: 4 }]);
  assert.deepEqual(p.cleared_player_ids, ["a"]);
});

test("buildSavePayload: a saved 0 that is blanked is cleared too, since 0 is a real score", () => {
  const p = buildSavePayload({ a: "" }, { a: 0 });
  assert.deepEqual(p.cleared_player_ids, ["a"]);
  assert.deepEqual(p.scores, []);
});

test("buildSavePayload: invalid boxes are reported and nothing is sent for them", () => {
  const p = buildSavePayload({ a: "7.5", b: "3" }, { a: 2 });
  assert.deepEqual(p.invalid_player_ids, ["a"]);
  assert.deepEqual(p.scores, [{ player_id: "b", points: 3 }]);
  assert.deepEqual(p.cleared_player_ids, []);
});

test("buildSavePayload: Arabic digits are sent as numbers", () => {
  assert.deepEqual(buildSavePayload({ a: "١٢" }, {}).scores, [{ player_id: "a", points: 12 }]);
});

test("hasUnsavedChanges compares what the boxes mean, not their text", () => {
  assert.equal(hasUnsavedChanges({ a: "9", b: "" }, { a: 9 }), false);
  assert.equal(hasUnsavedChanges({ a: "09" }, { a: 9 }), false);
  assert.equal(hasUnsavedChanges({ a: "٩" }, { a: 9 }), false);
  assert.equal(hasUnsavedChanges({ a: "10" }, { a: 9 }), true);
  assert.equal(hasUnsavedChanges({ a: "" }, { a: 0 }), true);
  assert.equal(hasUnsavedChanges({ a: "0" }, {}), true);
  assert.equal(hasUnsavedChanges({ a: "x" }, {}), true);
});

test("checkScoreSave: valid points for present players pass", () => {
  const present = new Set(["a", "b"]);
  assert.equal(checkScoreSave([{ player_id: "a", points: 0 }, { player_id: "b", points: 999 }], ["c"], present), null);
  assert.equal(checkScoreSave([], [], present), null);
});

test("checkScoreSave: out-of-range or fractional points reject the whole save", () => {
  const present = new Set(["a"]);
  const expected = { error: "Points must be whole numbers from 0 to 999", reload: false };
  assert.deepEqual(checkScoreSave([{ player_id: "a", points: 1000 }], [], present), expected);
  assert.deepEqual(checkScoreSave([{ player_id: "a", points: 2.5 }], [], present), expected);
  assert.deepEqual(checkScoreSave([{ player_id: "a", points: -1 }], [], present), expected);
});

test("checkScoreSave: a player listed twice, or scored and cleared at once, is refused", () => {
  const present = new Set(["a"]);
  assert.deepEqual(
    checkScoreSave([{ player_id: "a", points: 1 }, { player_id: "a", points: 2 }], [], present),
    { error: "A player is listed twice", reload: false }
  );
  assert.deepEqual(
    checkScoreSave([{ player_id: "a", points: 1 }], ["a"], present),
    { error: "A player can't be scored and cleared at once", reload: false }
  );
});

test("checkScoreSave: players not marked present reject the save and ask for a reload", () => {
  assert.deepEqual(
    checkScoreSave([{ player_id: "a", points: 1 }, { player_id: "b", points: 2 }, { player_id: "c", points: 3 }], [], new Set(["a"])),
    { error: "2 players aren't marked present for this session. Reload and try again.", reload: true }
  );
  assert.deepEqual(
    checkScoreSave([{ player_id: "b", points: 2 }], [], new Set(["a"])),
    { error: "1 player isn't marked present for this session. Reload and try again.", reload: true }
  );
});

test("applySavedScores: stores what was saved and keeps the boxes as typed since the click", () => {
  const before = { s1: { players: ["a", "b"], saved: {}, inputs: { a: "15", b: "9" } } };
  const after = applySavedScores(before, { sessionId: "s1", date: "2026-09-20" }, "2026-09-20", { a: 12, b: 9 });
  assert.deepEqual(after.s1.saved, { a: 12, b: 9 });
  assert.deepEqual(after.s1.inputs, { a: "15", b: "9" }, "a was changed to 15 while saving; it must not snap back to 12");
  assert.equal(hasUnsavedChanges(after.s1.inputs, after.s1.saved), true);
});

test("applySavedScores: a save that returns after the date changed leaves the new date alone", () => {
  const newWeek = { s1: { players: ["a"], saved: {}, inputs: { a: "" } } };
  assert.equal(applySavedScores(newWeek, { sessionId: "s1", date: "2026-09-20" }, "2026-09-27", { a: 12 }), newWeek);
});

test("applySavedScores: a save for a card that is no longer shown changes nothing", () => {
  const other = { s2: { players: ["a"], saved: {}, inputs: { a: "" } } };
  assert.equal(applySavedScores(other, { sessionId: "s1", date: "2026-09-20" }, "2026-09-20", { a: 12 }), other);
});
