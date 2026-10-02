// The player's own photo for a share card. Read and shrunk in the browser, kept only on
// this device (localStorage), never uploaded.

import { loadImage } from "./draw-share-card";

/** The card is 1350 tall, so a photo larger than this only costs memory and storage */
const MAX_SIDE = 1350;
const storageKey = (playerId: string) => `beachamp.sharePhoto.${playerId}`;

/**
 * The picked file as a JPEG data URL, at most 1350 px on its long side. Decoding through
 * an <img> applies the phone's EXIF rotation. Rejects for a format the browser can't read.
 */
export async function readPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't read photos");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Storage can be blocked (private browsing), full or cleared: the photo is then simply
// not remembered, and sharing still works.

export function recallPhoto(playerId: string): string | null {
  try {
    return localStorage.getItem(storageKey(playerId));
  } catch {
    return null;
  }
}

export function rememberPhoto(playerId: string, dataUrl: string) {
  try {
    localStorage.setItem(storageKey(playerId), dataUrl);
  } catch {
    // Not remembered; see above
  }
}

export function forgetPhoto(playerId: string) {
  try {
    localStorage.removeItem(storageKey(playerId));
  } catch {
    // Nothing to forget
  }
}
