// A merch sale recorded from the Merch page (saved as a Merch income row).

export interface SaleInput {
  itemId: string;
  size: string;
  quantity: number;
  /** What the buyer paid in EGP; less than price × quantity when discounted */
  amount: number;
  /** Cairo calendar day, YYYY-MM-DD */
  date: string;
  /** Optional, e.g. the buyer's name; saved as the income description */
  note: string;
}

export function validateSale(input: SaleInput): string | null {
  if (!input.itemId) return "Choose a product";
  if (!input.size) return "Choose a size";
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return "Quantity must be at least 1";
  // income.amount has CHECK (amount > 0)
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Enter the amount received (more than 0)";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Choose the sale date";
  return null;
}
