export const MERCH_CATEGORIES = [
  { value: "apparel", label: "Apparel" },
  { value: "accessories", label: "Accessories" },
  { value: "equipment", label: "Equipment" },
] as const;

export type MerchCategory = (typeof MERCH_CATEGORIES)[number]["value"];

export const MERCH_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One size"] as const;

export function getMerchCategoryLabel(value: string): string {
  return MERCH_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Sub-category (item type) within a category, e.g. Apparel → Hoodie */
export interface MerchSubcategory {
  id: string;
  category: string;
  name: string;
}

/** Shape passed from server pages to the merch client components. */
export interface MerchItemView {
  id: string;
  name: string;
  category: string;
  subcategory_id: string | null;
  subcategory_name: string | null;
  price: number;
  description: string | null;
  sizes: string[];
  image_url: string | null;
  is_active: boolean;
  is_sold_out: boolean;
}

/** Columns to select for toMerchView */
export const MERCH_ITEM_SELECT = "*, merch_subcategories(name)";

interface MerchRow {
  id: string;
  name: string;
  category: string;
  subcategory_id: string | null;
  merch_subcategories?: { name: string } | null;
  price: number | string;
  description: string | null;
  sizes: string[] | null;
  image_path: string | null;
  is_active: boolean;
  is_sold_out: boolean;
}

export function toMerchView(row: MerchRow, publicUrl: (path: string) => string): MerchItemView {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory_id: row.subcategory_id,
    subcategory_name: row.merch_subcategories?.name ?? null,
    price: Number(row.price),
    description: row.description,
    sizes: row.sizes || [],
    image_url: row.image_path ? publicUrl(row.image_path) : null,
    is_active: row.is_active,
    is_sold_out: row.is_sold_out,
  };
}

/** "Apparel · Hoodie", or just "Apparel" when there's no sub-category */
export function merchTypeLabel(category: string, subcategoryName: string | null | undefined): string {
  const cat = getMerchCategoryLabel(category);
  return subcategoryName ? `${cat} · ${subcategoryName}` : cat;
}
