// Parsing and validation for the product drawer's form, shared by the create and update actions.

import { MERCH_SIZES, ONE_SIZE } from "../config/merch";

export interface ProductFields {
  name: string;
  category_id: string;
  subcategory_id: string;
  price: number;
  description: string | null;
  is_active: boolean;
  /** In MERCH_SIZES order */
  sizes: string[];
  /** Opening count per size, used when a size is first added */
  opening: Record<string, number>;
}

const text = (fd: FormData, key: string) => ((fd.get(key) as string | null) ?? "").trim();

/** Reads the product form. Opening stock arrives as `stock_<size>`; blank means 0. */
export function parseProductForm(fd: FormData): { error: string } | { fields: ProductFields } {
  const name = text(fd, "name");
  const categoryId = text(fd, "category_id");
  const subcategoryId = text(fd, "subcategory_id");
  const priceRaw = text(fd, "price");
  const price = Number(priceRaw);
  const picked = new Set(fd.getAll("sizes").map(String));
  const sizes = MERCH_SIZES.filter((s) => picked.has(s));

  if (!name) return { error: "Add a name for the product" };
  if (!categoryId) return { error: "Choose a category" };
  if (!subcategoryId) return { error: "Choose a sub-category, e.g. Hoodie" };
  if (priceRaw === "" || !Number.isFinite(price) || price < 0) return { error: "Enter a price of 0 or more" };
  if (sizes.length === 0) return { error: "Pick at least one size, or One size" };
  if (sizes.includes(ONE_SIZE) && sizes.length > 1) return { error: "One size can't be combined with other sizes" };

  const opening: Record<string, number> = {};
  for (const size of sizes) {
    const raw = text(fd, `stock_${size}`);
    const count = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(count) || count < 0) {
      return { error: `Opening stock for ${size} must be a whole number, 0 or more` };
    }
    opening[size] = count;
  }

  return {
    fields: {
      name,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      price,
      description: text(fd, "description") || null,
      is_active: fd.get("is_active") === "on",
      sizes,
      opening,
    },
  };
}

/** Which stock rows an edit adds and removes; existing sizes keep their counts */
export function planSizeChanges(existing: string[], submitted: string[]): { add: string[]; remove: string[] } {
  return {
    add: submitted.filter((s) => !existing.includes(s)),
    remove: existing.filter((s) => !submitted.includes(s)),
  };
}
