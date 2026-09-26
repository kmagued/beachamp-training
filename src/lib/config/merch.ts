export const MERCH_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One size"] as const;

/** Caps, bottles, balls: a single count, left out of per-size sales */
export const ONE_SIZE = "One size";

/** A size with this many or fewer (but not zero) counts as low stock */
export const LOW_STOCK_THRESHOLD = 2;

/** Units on hand for one size of a product */
export interface MerchStockLevel {
  size: string;
  quantity: number;
}

/**
 * @deprecated The hardcoded list merch used before categories became rows. Finances still
 * reads it until it moves to merch_categories; nothing new should use it.
 */
export const MERCH_CATEGORIES = [
  { value: "apparel", label: "Apparel" },
  { value: "accessories", label: "Accessories" },
  { value: "equipment", label: "Equipment" },
] as const;

/** @deprecated See MERCH_CATEGORIES */
export function getMerchCategoryLabel(value: string): string {
  return MERCH_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** A merch category (Apparel, Accessories, …), managed on the Categories page */
export interface MerchCategory {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

/** Sub-category (item type) within a category, e.g. Apparel → Hoodie */
export interface MerchSubcategory {
  id: string;
  category_id: string;
  name: string;
}

/** A product as the admin pages see it, stock included */
export interface MerchItemView {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  subcategory_id: string | null;
  subcategory_name: string | null;
  price: number;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  /** In MERCH_SIZES order */
  stock: MerchStockLevel[];
}

/** A size as players see it: available or not, never the count */
export interface MerchCatalogSize {
  size: string;
  in_stock: boolean;
}

/** A product as the player catalog sees it */
export interface MerchCatalogItem {
  id: string;
  name: string;
  category_id: string;
  category_name: string;
  subcategory_name: string | null;
  price: number;
  description: string | null;
  image_url: string | null;
  sizes: MerchCatalogSize[];
  /** Has sizes and none is in stock */
  is_sold_out: boolean;
}

const MERCH_ITEM_COLUMNS =
  "id, name, category_id, subcategory_id, price, description, image_path, is_active, merch_categories(name), merch_subcategories(name)";

/** Columns for toMerchItemView (admins can read stock) */
export const MERCH_ITEM_SELECT = `${MERCH_ITEM_COLUMNS}, merch_stock(size, quantity)`;

/** Columns for toMerchCatalogItem (players can't read merch_stock; availability comes from merch_available_sizes) */
export const MERCH_CATALOG_SELECT = MERCH_ITEM_COLUMNS;

/** Display order set on the Categories page, then creation order */
export function sortCategories<T extends { sort_order: number; created_at: string }>(categories: T[]): T[] {
  return [...categories].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** "Apparel · Hoodie", or just "Apparel" when there's no sub-category */
export function merchTypeLabel(categoryName: string, subcategoryName?: string | null): string {
  return subcategoryName ? `${categoryName} · ${subcategoryName}` : categoryName;
}
