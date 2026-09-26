// Database rows → the shapes merch pages pass to their client components.

import type { MerchCatalogItem, MerchCatalogSize, MerchItemView } from "../config/merch";
import { sortSizes } from "./stock";

/** A merch_items row selected with MERCH_ITEM_SELECT (or MERCH_CATALOG_SELECT, without stock) */
export interface MerchItemRow {
  id: string;
  name: string;
  category_id: string;
  subcategory_id: string | null;
  price: number | string;
  description: string | null;
  image_path: string | null;
  is_active: boolean;
  merch_categories?: { name: string } | null;
  merch_subcategories?: { name: string } | null;
  merch_stock?: { size: string; quantity: number }[] | null;
}

type PublicUrl = (path: string) => string;

export function toMerchItemView(row: MerchItemRow, publicUrl: PublicUrl): MerchItemView {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.merch_categories?.name ?? "",
    subcategory_id: row.subcategory_id,
    subcategory_name: row.merch_subcategories?.name ?? null,
    price: Number(row.price),
    description: row.description,
    image_url: row.image_path ? publicUrl(row.image_path) : null,
    is_active: row.is_active,
    stock: sortSizes((row.merch_stock ?? []).map((s) => ({ size: s.size, quantity: s.quantity }))),
  };
}

/** merch_available_sizes() rows grouped per product, sizes in canonical order */
export function availabilityByItem(
  rows: { item_id: string; size: string; in_stock: boolean }[],
): Map<string, MerchCatalogSize[]> {
  const map = new Map<string, MerchCatalogSize[]>();
  for (const r of rows) {
    const sizes = map.get(r.item_id) ?? [];
    sizes.push({ size: r.size, in_stock: r.in_stock });
    map.set(r.item_id, sizes);
  }
  for (const [id, sizes] of map) map.set(id, sortSizes(sizes));
  return map;
}

export function toMerchCatalogItem(
  row: MerchItemRow,
  availability: Map<string, MerchCatalogSize[]>,
  publicUrl: PublicUrl,
): MerchCatalogItem {
  const sizes = availability.get(row.id) ?? [];
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.merch_categories?.name ?? "",
    subcategory_name: row.merch_subcategories?.name ?? null,
    price: Number(row.price),
    description: row.description,
    image_url: row.image_path ? publicUrl(row.image_path) : null,
    sizes,
    is_sold_out: sizes.length > 0 && sizes.every((s) => !s.in_stock),
  };
}
