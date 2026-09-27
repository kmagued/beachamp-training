import { test } from "node:test";
import assert from "node:assert/strict";
import { merchTypeLabel, sortCategories } from "../config/merch";
import { availabilityByItem, toMerchCatalogItem, toMerchItemView } from "./views";

const url = (path: string) => `https://cdn.test/${path}`;

test("toMerchItemView: price as a number, names flattened, stock in size order", () => {
  const view = toMerchItemView(
    {
      id: "i1",
      name: "Beachamp Black Hoodie",
      category_id: "app",
      subcategory_id: "hoodie",
      price: "1200.00",
      description: "Heavy cotton",
      image_path: "a.jpg",
      is_active: true,
      merch_categories: { name: "Apparel" },
      merch_subcategories: { name: "Hoodie" },
      merch_stock: [
        { size: "XL", quantity: 2 },
        { size: "S", quantity: 4 },
        { size: "M", quantity: 0 },
      ],
    },
    url,
  );
  assert.deepEqual(view, {
    id: "i1",
    name: "Beachamp Black Hoodie",
    category_id: "app",
    category_name: "Apparel",
    subcategory_id: "hoodie",
    subcategory_name: "Hoodie",
    price: 1200,
    description: "Heavy cotton",
    image_url: "https://cdn.test/a.jpg",
    is_active: true,
    stock: [
      { size: "S", quantity: 4 },
      { size: "M", quantity: 0 },
      { size: "XL", quantity: 2 },
    ],
  });
});

test("toMerchItemView: a legacy product with no sub-category, photo or stock rows", () => {
  const view = toMerchItemView(
    {
      id: "i2",
      name: "Old Hoodie",
      category_id: "app",
      subcategory_id: null,
      price: 800,
      description: null,
      image_path: null,
      is_active: false,
      merch_categories: { name: "Apparel" },
      merch_subcategories: null,
    },
    url,
  );
  assert.equal(view.subcategory_name, null);
  assert.equal(view.image_url, null);
  assert.deepEqual(view.stock, []);
});

test("availabilityByItem groups each product's sizes in size order", () => {
  const map = availabilityByItem([
    { item_id: "i1", size: "L", in_stock: true },
    { item_id: "i2", size: "One size", in_stock: true },
    { item_id: "i1", size: "S", in_stock: false },
  ]);
  assert.deepEqual(map.get("i1"), [
    { size: "S", in_stock: false },
    { size: "L", in_stock: true },
  ]);
  assert.deepEqual(map.get("i2"), [{ size: "One size", in_stock: true }]);
});

const catalogRow = {
  id: "i1",
  name: "Beachamp Black Hoodie",
  category_id: "app",
  subcategory_id: "hoodie",
  price: "1200",
  description: null,
  image_path: null,
  is_active: true,
  merch_categories: { name: "Apparel" },
  merch_subcategories: { name: "Hoodie" },
};

test("toMerchCatalogItem: sold out only when every size is out", () => {
  const allOut = availabilityByItem([
    { item_id: "i1", size: "S", in_stock: false },
    { item_id: "i1", size: "L", in_stock: false },
  ]);
  assert.equal(toMerchCatalogItem(catalogRow, allOut, url).is_sold_out, true);

  const oneLeft = availabilityByItem([
    { item_id: "i1", size: "S", in_stock: false },
    { item_id: "i1", size: "L", in_stock: true },
  ]);
  const item = toMerchCatalogItem(catalogRow, oneLeft, url);
  assert.equal(item.is_sold_out, false);
  assert.deepEqual(item.sizes, [
    { size: "S", in_stock: false },
    { size: "L", in_stock: true },
  ]);
  assert.equal(item.price, 1200);
  assert.equal(item.category_name, "Apparel");
});

test("toMerchCatalogItem: a product with no sizes listed isn't marked sold out", () => {
  const item = toMerchCatalogItem(catalogRow, new Map(), url);
  assert.deepEqual(item.sizes, []);
  assert.equal(item.is_sold_out, false);
});

test("merchTypeLabel joins category and sub-category, or shows the category alone", () => {
  assert.equal(merchTypeLabel("Apparel", "Hoodie"), "Apparel · Hoodie");
  assert.equal(merchTypeLabel("Apparel", null), "Apparel");
});

test("sortCategories orders by display order, then creation", () => {
  const sorted = sortCategories([
    { id: "b", sort_order: 1, created_at: "2026-01-01T00:00:00+00:00" },
    { id: "c", sort_order: 0, created_at: "2026-03-01T00:00:00+00:00" },
    { id: "a", sort_order: 0, created_at: "2026-02-01T00:00:00+00:00" },
  ]);
  assert.deepEqual(sorted.map((c) => c.id), ["a", "c", "b"]);
});
