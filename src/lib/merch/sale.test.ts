import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSale, type SaleInput } from "./sale";

const VALID: SaleInput = {
  itemId: "i-hoodie",
  size: "L",
  quantity: 2,
  amount: 2400,
  date: "2026-09-27",
  note: "",
};

test("validateSale accepts a complete sale, discounts included", () => {
  assert.equal(validateSale(VALID), null);
  assert.equal(validateSale({ ...VALID, amount: 1999.5 }), null);
});

const REJECTED: [string, Partial<SaleInput>, RegExp][] = [
  ["no product", { itemId: "" }, /product/i],
  ["no size", { size: "" }, /size/i],
  ["zero quantity", { quantity: 0 }, /quantity/i],
  ["fractional quantity", { quantity: 1.5 }, /quantity/i],
  ["a free sale (income must be more than 0)", { amount: 0 }, /amount/i],
  ["a missing amount", { amount: Number.NaN }, /amount/i],
  ["no date", { date: "" }, /date/i],
  ["a malformed date", { date: "27/09/2026" }, /date/i],
];

for (const [label, change, message] of REJECTED) {
  test(`validateSale rejects ${label}`, () => {
    const error = validateSale({ ...VALID, ...change });
    assert.ok(error, "expected an error");
    assert.match(error, message);
  });
}
