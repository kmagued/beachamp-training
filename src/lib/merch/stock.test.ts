import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areValidCounts,
  changedSizes,
  maxSellable,
  mergeRecountInput,
  parseCount,
  recountChanges,
  restockTotal,
  sortSizes,
  stockStatus,
  stockSummary,
} from "./stock";

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

test("parseCount reads whole numbers of 0 or more, and nothing else", () => {
  assert.equal(parseCount("4"), 4);
  assert.equal(parseCount(" 12 "), 12);
  assert.equal(parseCount("0"), 0);
  assert.equal(parseCount(""), null);
  assert.equal(parseCount("-1"), null);
  assert.equal(parseCount("2.5"), null);
  assert.equal(parseCount("abc"), null);
});

test("areValidCounts accepts whole numbers of 0 or more only", () => {
  assert.equal(areValidCounts([0, 3, 10]), true);
  assert.equal(areValidCounts([1, -1]), false);
  assert.equal(areValidCounts([1.5]), false);
  assert.equal(areValidCounts([Number.NaN]), false);
  assert.equal(areValidCounts(["3" as unknown]), false);
});

test("changedSizes lists sizes whose count moved underneath, including ones that disappeared", () => {
  assert.deepEqual(changedSizes(hoodie, { S: 4, M: 1, L: 7 }), ["M"]);
  assert.deepEqual(changedSizes(hoodie, { S: 4, M: 0 }), ["L"]);
  assert.deepEqual(changedSizes(hoodie, { S: 4, M: 0, L: 7 }), []);
});

test("mergeRecountInput: after a stale recount, edited rows keep what was typed and untouched rows follow the new count", () => {
  // The admin typed L=6; meanwhile a sale took S from 4 to 3
  const typed = { S: "4", M: "0", L: "6" };
  const latest = [
    { size: "S", quantity: 3 },
    { size: "M", quantity: 0 },
    { size: "L", quantity: 7 },
  ];
  assert.deepEqual(mergeRecountInput(hoodie, typed, latest), { S: "3", M: "0", L: "6" });
});
