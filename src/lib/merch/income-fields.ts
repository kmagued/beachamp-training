// The merch part of a Finances income entry: which product, size and quantity was sold.

const text = (fd: FormData, key: string) => ((fd.get(key) as string | null) ?? "").trim();

export interface MerchSaleFields {
  merch_item_id: string | null;
  merch_size: string | null;
  merch_quantity: number | null;
}

/** A linked product needs its size and a whole quantity of 1 or more (the stock trigger counts them) */
export function parseMerchSaleFields(fd: FormData): { error: string } | { fields: MerchSaleFields } {
  const itemId = text(fd, "merch_item_id");
  if (!itemId) return { fields: { merch_item_id: null, merch_size: null, merch_quantity: null } };

  const size = text(fd, "merch_size");
  if (!size) return { error: "Choose the size sold" };

  const raw = text(fd, "merch_quantity");
  const quantity = Number(raw);
  if (raw === "" || !Number.isInteger(quantity) || quantity < 1) return { error: "Quantity must be a whole number, 1 or more" };

  return { fields: { merch_item_id: itemId, merch_size: size, merch_quantity: quantity } };
}

/** "Apparel › Hoodie › Beachamp Black Hoodie · L ×2" for the Finances income list */
export function merchSaleLine(sale: {
  categoryName: string | null | undefined;
  subcategoryName: string | null | undefined;
  itemName: string;
  size: string | null | undefined;
  quantity: number | null | undefined;
}): string {
  const path = [sale.categoryName, sale.subcategoryName, sale.itemName].filter(Boolean).join(" › ");
  const size = sale.size ? ` · ${sale.size}` : "";
  const qty = sale.quantity && sale.quantity > 1 ? ` ×${sale.quantity}` : "";
  return path + size + qty;
}
