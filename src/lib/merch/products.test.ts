import { test } from "node:test";
import assert from "node:assert/strict";
import type { MerchItemView } from "../config/merch";
import { filterProducts, productStats } from "./products";

const product = (over: Partial<MerchItemView> & Pick<MerchItemView, "id" | "name">): MerchItemView => ({
  category_id: "app",
  category_name: "Apparel",
  subcategory_id: null,
  subcategory_name: null,
  price: 100,
  description: null,
  image_url: null,
  is_active: true,
  stock: [],
  ...over,
});

const ITEMS: MerchItemView[] = [
  product({
    id: "hoodie",
    name: "Beachamp Black Hoodie",
    subcategory_name: "Hoodie",
    stock: [
      { size: "S", quantity: 4 },
      { size: "M", quantity: 0 },
      { size: "L", quantity: 7 },
      { size: "XL", quantity: 2 },
    ],
  }),
  product({
    id: "tee",
    name: "Classic White Tee",
    subcategory_name: "T-shirt",
    stock: [
      { size: "S", quantity: 10 },
      { size: "M", quantity: 12 },
    ],
  }),
  product({
    id: "cap",
    name: "Team Cap",
    category_id: "acc",
    category_name: "Accessories",
    subcategory_name: "Cap",
    is_active: false,
    stock: [{ size: "One size", quantity: 0 }],
  }),
  product({
    id: "ball",
    name: "Mikasa Beach Ball",
    category_id: "eq",
    category_name: "Equipment",
    subcategory_name: "Ball",
    stock: [{ size: "One size", quantity: 5 }],
  }),
];

const ids = (items: MerchItemView[]) => items.map((i) => i.id);

test("productStats: units across every product, low and sold-out sizes for visible products only", () => {
  assert.deepEqual(productStats(ITEMS), { products: 4, visible: 3, units: 40, lowSizes: 1, outSizes: 1 });
});

test("filterProducts searches names and sub-categories, ignoring case and blank searches", () => {
  const all = { categoryId: "all", stock: "all" } as const;
  assert.deepEqual(ids(filterProducts(ITEMS, { ...all, search: "HOOD" })), ["hoodie"]);
  assert.deepEqual(ids(filterProducts(ITEMS, { ...all, search: "t-sh" })), ["tee"]);
  assert.deepEqual(ids(filterProducts(ITEMS, { ...all, search: "   " })), ["hoodie", "tee", "cap", "ball"]);
});

test("filterProducts by category", () => {
  assert.deepEqual(ids(filterProducts(ITEMS, { search: "", categoryId: "app", stock: "all" })), ["hoodie", "tee"]);
});

test("filterProducts: 'low or out' shows visible products needing stock, 'hidden' shows hidden ones", () => {
  assert.deepEqual(ids(filterProducts(ITEMS, { search: "", categoryId: "all", stock: "attention" })), ["hoodie"]);
  assert.deepEqual(ids(filterProducts(ITEMS, { search: "", categoryId: "all", stock: "hidden" })), ["cap"]);
  assert.deepEqual(ids(filterProducts(ITEMS, { search: "", categoryId: "acc", stock: "attention" })), []);
});
