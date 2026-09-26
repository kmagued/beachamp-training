import { LOW_STOCK_THRESHOLD, MERCH_SIZES, type MerchStockLevel } from "../config/merch";

export type StockStatus = "out" | "low" | "ok";

const SIZE_RANK = new Map<string, number>(MERCH_SIZES.map((s, i) => [s, i]));

/** Canonical size order (XS … XXL, One size); sizes outside the list go last, A→Z */
export function sortSizes<T extends { size: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = SIZE_RANK.get(a.size) ?? MERCH_SIZES.length;
    const rb = SIZE_RANK.get(b.size) ?? MERCH_SIZES.length;
    return ra !== rb ? ra - rb : a.size.localeCompare(b.size);
  });
}

export function stockStatus(quantity: number): StockStatus {
  if (quantity <= 0) return "out";
  if (quantity <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

export interface StockSummary {
  total: number;
  lowSizes: number;
  outSizes: number;
  /** Has at least one size and every size is at 0 */
  soldOut: boolean;
}

export function stockSummary(stock: { quantity: number }[]): StockSummary {
  let total = 0;
  let lowSizes = 0;
  let outSizes = 0;
  for (const { quantity } of stock) {
    total += quantity;
    const status = stockStatus(quantity);
    if (status === "low") lowSizes += 1;
    if (status === "out") outSizes += 1;
  }
  return { total, lowSizes, outSizes, soldOut: stock.length > 0 && outSizes === stock.length };
}

/**
 * Most units of `size` a sale can take. When editing an existing sale of the same product,
 * pass it as `editing`: its own units go back before the new quantity is taken (the stock
 * trigger works the same way), but only if the product still stocks that size.
 */
export function maxSellable(
  stock: MerchStockLevel[],
  size: string,
  editing?: { size: string; quantity: number } | null,
): number {
  const row = stock.find((s) => s.size === size);
  if (!row) return 0;
  return row.quantity + (editing && editing.size === size ? editing.quantity : 0);
}

export interface RecountChange {
  size: string;
  expected: number;
  counted: number;
}

/** The sizes a recount actually changes, with the count the admin saw when they started */
export function recountChanges(current: MerchStockLevel[], counted: Record<string, number>): RecountChange[] {
  return current
    .filter((s) => s.size in counted && counted[s.size] !== s.quantity)
    .map((s) => ({ size: s.size, expected: s.quantity, counted: counted[s.size] }));
}

/** Units a restock adds (arrivals of 0 or less don't count) */
export function restockTotal(added: Record<string, number>): number {
  return Object.values(added).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);
}

/** A typed stock count: a whole number of 0 or more, otherwise null */
export function parseCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Server-side check for counts arriving from the client */
export function areValidCounts(values: unknown[]): boolean {
  return values.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0);
}

/** Sizes whose count in `latest` differs from what the admin was looking at (a missing size counts as changed) */
export function changedSizes(before: MerchStockLevel[], latest: Record<string, number>): string[] {
  return before.filter((s) => latest[s.size] !== s.quantity).map((s) => s.size);
}

/**
 * Recount inputs after the counts moved underneath (a sale landed while counting): a row the
 * admin edited keeps what they typed; a row they left alone takes the new count, so saving
 * again can't quietly undo that sale.
 */
export function mergeRecountInput(
  before: MerchStockLevel[],
  typed: Record<string, string>,
  latest: MerchStockLevel[],
): Record<string, string> {
  const was = new Map(before.map((s) => [s.size, String(s.quantity)]));
  return Object.fromEntries(
    latest.map((s) => {
      const value = typed[s.size];
      const edited = value !== undefined && was.has(s.size) && value.trim() !== was.get(s.size);
      return [s.size, edited ? value : String(s.quantity)];
    }),
  );
}
