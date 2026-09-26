// Rules for the Categories page: ordering, and when something can be deleted.

import { sortCategories } from "../config/merch";

/**
 * New display orders after moving one category up or down, renumbered 0…n-1 so tied orders
 * (e.g. two categories both at 0) can't swallow the move. Only rows whose order changes are
 * returned, sorted by id; null when the category is already at that end.
 */
export function reorderCategories(
  categories: { id: string; sort_order: number; created_at: string }[],
  id: string,
  direction: "up" | "down",
): { id: string; sort_order: number }[] | null {
  const ordered = sortCategories(categories);
  const from = ordered.findIndex((c) => c.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ordered.length) return null;
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return ordered
    .map((c, i) => ({ id: c.id, sort_order: i, changed: c.sort_order !== i }))
    .filter((c) => c.changed)
    .map(({ id: cid, sort_order }) => ({ id: cid, sort_order }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Products using a sub-category: live ones, and deleted ones kept for their past sales */
export interface SubcategoryUsage {
  live: number;
  deleted: number;
}

export function usageLabel(u: SubcategoryUsage): string {
  if (u.live > 0) return `${u.live} ${u.live === 1 ? "product" : "products"}`;
  return u.deleted > 0 ? "past sales only" : "no products";
}

/** Deleted products still point at their sub-category, so its sales keep their label */
export function canDeleteSubcategory(u: SubcategoryUsage): boolean {
  return u.live + u.deleted === 0;
}

export function canDeleteCategory(u: { subcategories: number; items: number }): boolean {
  return u.subcategories === 0 && u.items === 0;
}
