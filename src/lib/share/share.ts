// What a shared achievement says and is called. Pure, so the share drawer and the card
// drawing agree, and tests cover them without a browser.

import { branding } from "@/lib/config/branding";
import type { BadgeIconKey } from "@/lib/badges/config";
import { placeLabel, type Place } from "@/lib/king-of-court/awards";
import { formatMonth, ordinal } from "@/lib/king-of-court/format";

export type ShareSubject =
  | {
      kind: "award";
      place: Place;
      groupName: string;
      /** YYYY-MM */
      month: string;
      points: number;
      sessions: number;
      playerName: string;
    }
  | {
      kind: "badge";
      name: string;
      icon: BadgeIconKey;
      description: string;
      /** YYYY-MM-DD */
      earnedOn: string;
      playerName: string;
    };

/**
 * The line handed to the share sheet with the image. WhatsApp keeps it; Instagram ignores
 * it. The group name is never made possessive: "Women's Team's" reads badly.
 */
export function shareText(subject: ShareSubject): string {
  if (subject.kind === "award") {
    return `${placeLabel(subject.place)} in the ${subject.groupName} King of Court for ${formatMonth(subject.month, "long")} · ${branding.name}`;
  }
  return `I earned the ${subject.name} badge at ${branding.name} · ${subject.description}`;
}

/** "Café  Champion" → "cafe-champion"; anything with no letters or digits → "achievement" */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "achievement";
}

/** "beachamp-1st-place-september-2026.jpg", "beachamp-court-regular-badge.jpg" */
export function shareFileName(subject: ShareSubject): string {
  const what =
    subject.kind === "award"
      ? `${ordinal(subject.place)}-place-${slugify(formatMonth(subject.month, "long"))}`
      : `${slugify(subject.name)}-badge`;
  return `beachamp-${what}.jpg`;
}

/**
 * The largest font size, from start down to min, at which measure(size) fits maxWidth.
 * Text still too wide at min is left for the caller to cut short.
 */
export function fitFontSize(measure: (size: number) => number, maxWidth: number, start: number, min: number): number {
  for (let size = start; size > min; size--) {
    if (measure(size) <= maxWidth) return size;
  }
  return min;
}
