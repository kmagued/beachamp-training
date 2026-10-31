/** Spots in the "Life at …" gallery. The first is the large one. */
export const GALLERY_SLOTS = [1, 2, 3] as const;

/** Beside the "Find your level" heading */
export const LEVELS_SLOT = 4;

/** Behind "Ready to hit the court?", darkened under the text */
export const CTA_SLOT = 5;

export const LANDING_PHOTO_SLOTS = [...GALLERY_SLOTS, LEVELS_SLOT, CTA_SLOT] as const;

export const LANDING_PHOTOS_BUCKET = "landing-photos";

/** One spot on the landing page */
export interface LandingPhoto {
  slot: number;
  /** Public URL, or null while the spot has no photo */
  url: string | null;
}

/** Every spot, filled from the stored rows, by slot */
export function landingPhotosFrom(
  rows: { slot: number; storage_path: string }[],
  publicUrl: (path: string) => string,
): Record<number, LandingPhoto> {
  return Object.fromEntries(
    LANDING_PHOTO_SLOTS.map((slot) => {
      const row = rows.find((r) => r.slot === slot);
      return [slot, { slot, url: row ? publicUrl(row.storage_path) : null }];
    }),
  );
}
