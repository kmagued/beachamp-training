import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProductForm, planSizeChanges } from "./product-form";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

const VALID: [string, string][] = [
  ["name", "  Beachamp Black Hoodie "],
  ["category_id", "app"],
  ["subcategory_id", "hoodie"],
  ["price", "1200"],
  ["description", "   "],
  ["is_active", "on"],
  ["sizes", "L"],
  ["sizes", "S"],
  ["sizes", "M"],
  ["stock_S", "4"],
  ["stock_M", ""],
  ["stock_L", "7"],
];

const without = (key: string) => VALID.filter(([k]) => k !== key);
const replacing = (key: string, value: string) => [...without(key), [key, value] as [string, string]];

test("parseProductForm reads a valid product: trimmed text, canonical size order, blank opening stock is 0", () => {
  assert.deepEqual(parseProductForm(form(VALID)), {
    fields: {
      name: "Beachamp Black Hoodie",
      category_id: "app",
      subcategory_id: "hoodie",
      price: 1200,
      description: null,
      is_active: true,
      sizes: ["S", "M", "L"],
      opening: { S: 4, M: 0, L: 7 },
    },
  });
});

test("parseProductForm: the product is hidden when the switch isn't sent", () => {
  const parsed = parseProductForm(form(without("is_active")));
  assert.ok("fields" in parsed);
  assert.equal(parsed.fields.is_active, false);
});

test("parseProductForm: sizes outside the size list are ignored", () => {
  const parsed = parseProductForm(form([...VALID, ["sizes", "XXXL"], ["stock_XXXL", "3"]]));
  assert.ok("fields" in parsed);
  assert.deepEqual(parsed.fields.sizes, ["S", "M", "L"]);
  assert.equal("XXXL" in parsed.fields.opening, false);
});

const REJECTED: [string, [string, string][], RegExp][] = [
  ["no name", replacing("name", "   "), /name/i],
  ["no category", without("category_id"), /category/i],
  ["no sub-category", without("subcategory_id"), /sub-category/i],
  ["a blank price", replacing("price", ""), /price/i],
  ["a negative price", replacing("price", "-5"), /price/i],
  ["no sizes", VALID.filter(([k]) => k !== "sizes"), /size/i],
  ["only unknown sizes", [...VALID.filter(([k]) => k !== "sizes"), ["sizes", "XXXL"]], /size/i],
  ["One size mixed with other sizes", [...VALID, ["sizes", "One size"]], /One size/],
  ["negative opening stock", replacing("stock_M", "-1"), /\bM\b/],
  ["fractional opening stock", replacing("stock_M", "2.5"), /\bM\b/],
];

for (const [label, entries, message] of REJECTED) {
  test(`parseProductForm rejects ${label}`, () => {
    const parsed = parseProductForm(form(entries));
    assert.ok("error" in parsed, `expected an error, got ${JSON.stringify(parsed)}`);
    assert.match(parsed.error, message);
  });
}

test("planSizeChanges lists the sizes to add and the sizes to remove", () => {
  assert.deepEqual(planSizeChanges(["S", "M", "L"], ["M", "L", "XL"]), { add: ["XL"], remove: ["S"] });
  assert.deepEqual(planSizeChanges(["M"], ["M"]), { add: [], remove: [] });
});
