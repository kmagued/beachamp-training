import { test } from "node:test";
import assert from "node:assert/strict";
import { merchSaleLine, parseMerchSaleFields } from "./income-fields";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [key, value] of entries) fd.append(key, value);
  return fd;
}

test("income without a product has no merch fields, whatever else was sent", () => {
  const none = { fields: { merch_item_id: null, merch_size: null, merch_quantity: null } };
  assert.deepEqual(parseMerchSaleFields(form([])), none);
  assert.deepEqual(parseMerchSaleFields(form([["merch_item_id", ""], ["merch_size", "L"], ["merch_quantity", "2"]])), none);
});

test("a product-linked sale carries its size and quantity", () => {
  assert.deepEqual(
    parseMerchSaleFields(form([["merch_item_id", "i1"], ["merch_size", "L"], ["merch_quantity", "2"]])),
    { fields: { merch_item_id: "i1", merch_size: "L", merch_quantity: 2 } },
  );
});

test("a product-linked sale needs a size", () => {
  const parsed = parseMerchSaleFields(form([["merch_item_id", "i1"], ["merch_quantity", "2"]]));
  assert.ok("error" in parsed);
  assert.match(parsed.error, /size/i);
});

for (const qty of ["0", "1.5", "", "-2"]) {
  test(`a product-linked sale rejects quantity "${qty}"`, () => {
    const parsed = parseMerchSaleFields(form([["merch_item_id", "i1"], ["merch_size", "L"], ["merch_quantity", qty]]));
    assert.ok("error" in parsed);
    assert.match(parsed.error, /quantity/i);
  });
}

test("merchSaleLine shows category, sub-category, product, size and quantity", () => {
  const line = { categoryName: "Apparel", subcategoryName: "Hoodie", itemName: "Beachamp Black Hoodie" };
  assert.equal(merchSaleLine({ ...line, size: "L", quantity: 2 }), "Apparel › Hoodie › Beachamp Black Hoodie · L ×2");
  assert.equal(merchSaleLine({ ...line, size: "L", quantity: 1 }), "Apparel › Hoodie › Beachamp Black Hoodie · L");
  // Older sales were recorded without a size
  assert.equal(merchSaleLine({ ...line, size: null, quantity: 2 }), "Apparel › Hoodie › Beachamp Black Hoodie ×2");
  assert.equal(
    merchSaleLine({ categoryName: "Apparel", subcategoryName: null, itemName: "Old Hoodie", size: "M", quantity: null }),
    "Apparel › Old Hoodie · M",
  );
});
