// Presentation rules for the player merch catalog.

import type { MerchCatalogSize } from "../config/merch";
import { timestampKey } from "./analytics";

/** Word shown on a product tile that has no photo: its sub-category, else its category */
export function placeholderWord(subcategoryName: string | null | undefined, categoryName: string): string {
  return (subcategoryName?.trim() || categoryName.trim()).toUpperCase();
}

/** Font size, in container-width units (cqw), that lets the word fill a tile without spilling out.
 *  Bebas Neue capitals run about 0.42em wide; short words are capped so "CAP" doesn't turn into a wall. */
export function placeholderFontSize(word: string): number {
  const length = Math.max(word.length, 1);
  return Math.min(72, Math.floor(96 / (0.42 * length)));
}

export interface CatalogTone {
  /** Tile background */
  background: string;
  /** Placeholder lettering */
  ink: string;
}

/** Sea, lagoon and sun from the Beachamp palette */
export const CATALOG_TONES: readonly CatalogTone[] = [
  { background: "#124B5D", ink: "#5CACB0" },
  { background: "#5CACB0", ink: "#E7F0F3" },
  { background: "#F7AC40", ink: "#FDE9C5" },
];

/** A category keeps one tone, picked by when it was created, so reordering never recolours it */
export function categoryTone(categoryId: string, categories: { id: string; created_at: string }[]): CatalogTone {
  const ordered = [...categories].sort(
    (a, b) => timestampKey(a.created_at).localeCompare(timestampKey(b.created_at)) || a.id.localeCompare(b.id),
  );
  const index = ordered.findIndex((c) => c.id === categoryId);
  return CATALOG_TONES[Math.max(index, 0) % CATALOG_TONES.length];
}

/** "M and XL are sold out right now." — null when nothing is out, or everything is (the product reads as sold out) */
export function soldOutSizesNote(sizes: MerchCatalogSize[]): string | null {
  const out = sizes.filter((s) => !s.in_stock).map((s) => s.size);
  if (out.length === 0 || out.length === sizes.length) return null;
  const list = out.length === 1 ? out[0] : `${out.slice(0, -1).join(", ")} and ${out[out.length - 1]}`;
  return `${list} ${out.length === 1 ? "is" : "are"} sold out right now.`;
}
