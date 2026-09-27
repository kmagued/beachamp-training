import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG_TONES, categoryTone, placeholderFontSize, placeholderWord, soldOutSizesNote } from "./catalog";

test("placeholderWord uses the sub-category, falling back to the category, in capitals", () => {
  assert.equal(placeholderWord("T-shirt", "Apparel"), "T-SHIRT");
  assert.equal(placeholderWord(null, "Accessories"), "ACCESSORIES");
  assert.equal(placeholderWord("  Cap ", "Accessories"), "CAP");
  assert.equal(placeholderWord("", "Equipment"), "EQUIPMENT");
});

test("placeholderFontSize: short words are capped, longer words shrink so they still fit the tile", () => {
  const cap = placeholderFontSize("CAP");
  const bottle = placeholderFontSize("BOTTLE");
  const wristband = placeholderFontSize("WRISTBAND");
  assert.equal(cap, placeholderFontSize("BAG"), "same length, same size");
  assert.ok(bottle < cap && wristband < bottle, `${cap} > ${bottle} > ${wristband}`);
  // Bebas Neue capitals are about 0.42em wide; the word should span no more than the tile
  for (const word of ["BOTTLE", "WRISTBAND", "ACCESSORIES", "T-SHIRT"]) {
    assert.ok(placeholderFontSize(word) * 0.42 * word.length <= 100, `${word} overflows`);
  }
});

const cats = [
  { id: "eq", created_at: "2026-09-26T23:21:12.343922+00:00" },
  { id: "app", created_at: "2026-09-26T23:21:12.34392+00:00" },
  { id: "acc", created_at: "2026-09-26T23:21:12.343921+00:00" },
  { id: "bags", created_at: "2026-10-01T10:00:00+00:00" },
];

test("categoryTone gives each category a brand tone in creation order, whatever the list order", () => {
  assert.deepEqual(categoryTone("app", cats), CATALOG_TONES[0]);
  assert.deepEqual(categoryTone("acc", cats), CATALOG_TONES[1]);
  assert.deepEqual(categoryTone("eq", cats), CATALOG_TONES[2]);
});

test("categoryTone wraps round the tones after the third category and defaults for unknown ones", () => {
  assert.deepEqual(categoryTone("bags", cats), CATALOG_TONES[0]);
  assert.deepEqual(categoryTone("missing", cats), CATALOG_TONES[0]);
});

test("soldOutSizesNote names the sold-out sizes, or says nothing when none or all are out", () => {
  const s = (size: string, in_stock: boolean) => ({ size, in_stock });
  assert.equal(soldOutSizesNote([s("S", true), s("M", false), s("L", true)]), "M is sold out right now.");
  assert.equal(soldOutSizesNote([s("S", true), s("M", false), s("XL", false)]), "M and XL are sold out right now.");
  assert.equal(
    soldOutSizesNote([s("S", false), s("M", false), s("L", true), s("XL", false)]),
    "S, M and XL are sold out right now.",
  );
  assert.equal(soldOutSizesNote([s("S", true), s("M", true)]), null);
  assert.equal(soldOutSizesNote([s("One size", false)]), null);
  assert.equal(soldOutSizesNote([]), null);
});
