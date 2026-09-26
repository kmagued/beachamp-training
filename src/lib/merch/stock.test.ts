import { test } from "node:test";
import assert from "node:assert/strict";
import { maxSellable, recountChanges, restockTotal, sortSizes, stockStatus, stockSummary } from "./stock";

test("stockStatus: 0 is out, 1-2 are low, 3 and up are fine", () => {
  assert.equal(stockStatus(0), "out");
  assert.equal(stockStatus(1), "low");
  assert.equal(stockStatus(2), "low");
  assert.equal(stockStatus(3), "ok");
  assert.equal(stockStatus(40), "ok");
});

test("sortSizes follows XS..XXL, One size, then unknown sizes A-Z, without mutating the input", () => {
  const input = [{ size: "L" }, { size: "One size" }, { size: "Z" }, { size: "XS" }, { size: "B" }, { size: "M" }];
  const sorted = sortSizes(input);
  assert.deepEqual(
    sorted.map((r) => r.size),
    ["XS", "M", "L", "One size", "B", "Z"],
  );
  assert.deepEqual(
    input.map((r) => r.size),
    ["L", "One size", "Z", "XS", "B", "M"],
  );
});

test("stockSummary counts units and low/out sizes", () => {
  assert.deepEqual(stockSummary([{ quantity: 4 }, { quantity: 0 }, { quantity: 7 }, { quantity: 2 }]), {
    total: 13,
    lowSizes: 1,
    outSizes: 1,
    soldOut: false,
  });
});

test("stockSummary: sold out only when there are sizes and every one is at 0", () => {
  assert.deepEqual(stockSummary([{ quantity: 0 }, { quantity: 0 }]), {
    total: 0,
    lowSizes: 0,
    outSizes: 2,
    soldOut: true,
  });
  assert.equal(stockSummary([]).soldOut, false);
});

const hoodie = [
  { size: "S", quantity: 4 },
  { size: "M", quantity: 0 },
  { size: "L", quantity: 7 },
];

test("maxSellable: a new sale can take what's in stock for that size", () => {
  assert.equal(maxSellable(hoodie, "L"), 7);
  assert.equal(maxSellable(hoodie, "M"), 0);
});

test("maxSellable: editing a sale of the same size adds back its own units", () => {
  assert.equal(maxSellable(hoodie, "L", { size: "L", quantity: 2 }), 9);
  assert.equal(maxSellable(hoodie, "M", { size: "M", quantity: 1 }), 1);
});

test("maxSellable: editing a sale of another size doesn't add its units", () => {
  assert.equal(maxSellable(hoodie, "L", { size: "M", quantity: 2 }), 7);
});

test("maxSellable: a size the product no longer has allows nothing, even for its own sale", () => {
  assert.equal(maxSellable(hoodie, "XXL"), 0);
  assert.equal(maxSellable(hoodie, "XXL", { size: "XXL", quantity: 2 }), 0);
});

test("recountChanges keeps only stocked sizes whose count differs", () => {
  assert.deepEqual(recountChanges(hoodie, { S: 4, M: 2, L: 6, XXL: 3 }), [
    { size: "M", expected: 0, counted: 2 },
    { size: "L", expected: 7, counted: 6 },
  ]);
  assert.deepEqual(recountChanges(hoodie, { S: 4 }), []);
});

test("restockTotal adds up positive arrivals only", () => {
  assert.equal(restockTotal({ M: 10, L: 5, S: 0, XL: -2 }), 15);
  assert.equal(restockTotal({}), 0);
});
