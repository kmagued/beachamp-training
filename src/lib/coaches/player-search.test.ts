import { test } from "node:test";
import assert from "node:assert/strict";
import { anyFieldFilter, playerSearch } from "./player-search";

test("playerSearch: two or more words are a first and a last name", () => {
  assert.deepEqual(playerSearch("John Doe"), { kind: "full-name", first: "John", last: "Doe" });
  assert.deepEqual(playerSearch("  Mary  Ann   Lee "), { kind: "full-name", first: "Mary", last: "Ann Lee" });
});

test("playerSearch: one word matches name, email or phone", () => {
  assert.deepEqual(playerSearch("omar"), { kind: "any", text: "omar" });
  assert.deepEqual(playerSearch("0100"), { kind: "any", text: "0100" });
  assert.deepEqual(playerSearch("omar@example.com"), { kind: "any", text: "omar@example.com" });
});

test("playerSearch: a phone typed with spaces or dashes is one number, not a name", () => {
  assert.deepEqual(playerSearch("010 1234 5678"), { kind: "any", text: "01012345678" });
  assert.deepEqual(playerSearch("+20 100-123-4567"), { kind: "any", text: "+201001234567" });
});

test("playerSearch: fewer than 2 characters searches nothing", () => {
  assert.equal(playerSearch(""), null);
  assert.equal(playerSearch(" o "), null);
});

test("playerSearch: commas and brackets can't break the filter", () => {
  assert.deepEqual(playerSearch("omar,(x)"), { kind: "full-name", first: "omar", last: "x" });
  assert.equal(playerSearch("(,)"), null);
});

test("anyFieldFilter: the word in either name, the email or the phone", () => {
  assert.equal(
    anyFieldFilter("omar"),
    "first_name.ilike.%omar%,last_name.ilike.%omar%,email.ilike.%omar%,phone.ilike.%omar%"
  );
});
