import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteCategory, canDeleteSubcategory, reorderCategories, usageLabel } from "./categories";

const cat = (id: string, sort_order: number, created_at: string) => ({ id, sort_order, created_at });

test("reorderCategories moves a category one place and returns only the rows whose order changed", () => {
  const cats = [cat("a", 0, "2026-01-01"), cat("b", 1, "2026-01-02"), cat("c", 2, "2026-01-03")];
  assert.deepEqual(reorderCategories(cats, "c", "up"), [
    { id: "b", sort_order: 2 },
    { id: "c", sort_order: 1 },
  ]);
  assert.deepEqual(reorderCategories(cats, "a", "down"), [
    { id: "a", sort_order: 1 },
    { id: "b", sort_order: 0 },
  ]);
});

test("reorderCategories: nothing moves past either end", () => {
  const cats = [cat("a", 0, "2026-01-01"), cat("b", 1, "2026-01-02")];
  assert.equal(reorderCategories(cats, "a", "up"), null);
  assert.equal(reorderCategories(cats, "b", "down"), null);
  assert.equal(reorderCategories(cats, "missing", "up"), null);
});

test("reorderCategories renumbers tied orders so every move sticks", () => {
  // a and b share order 0 (b created later); moving b up must put it strictly first
  const cats = [cat("a", 0, "2026-01-01"), cat("b", 0, "2026-01-02"), cat("c", 1, "2026-01-03")];
  assert.deepEqual(reorderCategories(cats, "b", "up"), [
    { id: "a", sort_order: 1 },
    { id: "c", sort_order: 2 },
  ]);
});

test("usageLabel: live products, past sales only, or nothing", () => {
  assert.equal(usageLabel({ live: 1, deleted: 0 }), "1 product");
  assert.equal(usageLabel({ live: 3, deleted: 2 }), "3 products");
  assert.equal(usageLabel({ live: 0, deleted: 1 }), "past sales only");
  assert.equal(usageLabel({ live: 0, deleted: 0 }), "no products");
});

test("a sub-category can be deleted only when no product, live or deleted, uses it", () => {
  assert.equal(canDeleteSubcategory({ live: 0, deleted: 0 }), true);
  assert.equal(canDeleteSubcategory({ live: 0, deleted: 1 }), false);
  assert.equal(canDeleteSubcategory({ live: 2, deleted: 0 }), false);
});

test("a category can be deleted only when it has no sub-categories and no products", () => {
  assert.equal(canDeleteCategory({ subcategories: 0, items: 0 }), true);
  assert.equal(canDeleteCategory({ subcategories: 1, items: 0 }), false);
  assert.equal(canDeleteCategory({ subcategories: 0, items: 1 }), false);
});
