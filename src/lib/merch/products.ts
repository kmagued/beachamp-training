// Filters and headline numbers for the admin Products page.

import type { MerchItemView } from "../config/merch";
import { stockSummary } from "./stock";

/** "attention": visible products with a size that is low or out */
export type StockFilter = "all" | "attention" | "hidden";

export interface ProductFilters {
  search: string;
  /** A category id, or "all" */
  categoryId: string;
  stock: StockFilter;
}

function needsStock(item: MerchItemView) {
  const s = stockSummary(item.stock);
  return s.lowSizes + s.outSizes > 0;
}

export function filterProducts(items: MerchItemView[], f: ProductFilters): MerchItemView[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((item) => {
    if (q && !item.name.toLowerCase().includes(q) && !(item.subcategory_name ?? "").toLowerCase().includes(q)) {
      return false;
    }
    if (f.categoryId !== "all" && item.category_id !== f.categoryId) return false;
    if (f.stock === "attention") return item.is_active && needsStock(item);
    if (f.stock === "hidden") return !item.is_active;
    return true;
  });
}

export interface ProductStats {
  products: number;
  visible: number;
  /** Units on hand across every product */
  units: number;
  /** Sizes at 1–2, for products players can see (hidden ones are being prepared or retired) */
  lowSizes: number;
  /** Sizes at 0, for products players can see */
  outSizes: number;
}

export function productStats(items: MerchItemView[]): ProductStats {
  const stats: ProductStats = { products: items.length, visible: 0, units: 0, lowSizes: 0, outSizes: 0 };
  for (const item of items) {
    const s = stockSummary(item.stock);
    stats.units += s.total;
    if (!item.is_active) continue;
    stats.visible += 1;
    stats.lowSizes += s.lowSizes;
    stats.outSizes += s.outSizes;
  }
  return stats;
}
