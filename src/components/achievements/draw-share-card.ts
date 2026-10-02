// Draws the shareable achievement card on a canvas, in the browser. 1080 × 1350 is the
// 4:5 portrait size Instagram wants. Nothing is uploaded: the card and the player's photo
// never leave the phone until the player shares them.

import { branding } from "@/lib/config/branding";
import { formatBadgeDate } from "@/lib/badges/words";
import { formatMonth } from "@/lib/king-of-court/format";
import { fitFontSize, type ShareSubject } from "@/lib/share/share";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const MARGIN = 80;
const TEXT_WIDTH = CARD_WIDTH - MARGIN * 2;

const NAVY_DEEP = "#0C313A";
const NAVY = branding.colors.primary[800];
const TEAL = branding.colors.primary[500];
const GOLD = branding.colors.accent[500];
const GOLD_DEEP = branding.colors.accent[600];
const CREAM = branding.colors.sand;

// Canvas-only family names: next/font hashes the app's own, so a canvas can't name them
const DISPLAY = "ShareBebas";
const BODY = "ShareMontserrat";

let fontsReady: Promise<void> | null = null;

/** Loads the card's fonts once per page. Drawing before they load would fall back to a system font. */
export function loadCardFonts(): Promise<void> {
  if (!fontsReady) {
    const faces = [
      new FontFace(DISPLAY, "url(/fonts/BebasNeue-Regular.ttf)"),
      new FontFace(BODY, "url(/fonts/Montserrat-Medium.ttf)", { weight: "500" }),
      new FontFace(BODY, "url(/fonts/Montserrat-SemiBold.ttf)", { weight: "600" }),
    ];
    fontsReady = Promise.all(faces.map((f) => f.load())).then((loaded) => {
      for (const face of loaded) document.fonts.add(face);
    });
    // A failed load can be retried by the next draw
    fontsReady.catch(() => {
      fontsReady = null;
    });
  }
  return fontsReady;
}

/** Resolves once the image has decoded; rejects for a format the browser can't read (e.g. HEIC) */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unreadable image"));
    img.src = src;
  });
}

const font = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

/** Cuts text that still doesn't fit at the smallest size, with an ellipsis */
function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Sets the largest font from start down to min that fits the width, and returns the size */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, family: string, start: number, min: number) {
  const size = fitFontSize(
    (s) => {
      ctx.font = font(weight, s, family);
      return ctx.measureText(text).width;
    },
    TEXT_WIDTH,
    start,
    min
  );
  ctx.font = font(weight, size, family);
  return size;
}

/** Letter-spaced small caps, drawn a character at a time (ctx.letterSpacing isn't everywhere) */
function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

/** The photo cropped to cover the card, centred */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(CARD_WIDTH / img.naturalWidth, CARD_HEIGHT / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (CARD_WIDTH - w) / 2, (CARD_HEIGHT - h) / 2, w, h);
}

/** fadeFrom: how far down (0–1) the navy starts rising behind the text, which sits higher on a badge card */
function drawBackground(ctx: CanvasRenderingContext2D, photo: HTMLImageElement | null, fadeFrom: number) {
  if (photo) {
    drawCover(ctx, photo);
    // Navy behind the logo at the top, and rising from the bottom behind the text
    const top = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT * 0.26);
    top.addColorStop(0, "rgba(12, 49, 58, 0.82)");
    top.addColorStop(1, "rgba(12, 49, 58, 0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT * 0.26);

    const bottom = ctx.createLinearGradient(0, CARD_HEIGHT * fadeFrom, 0, CARD_HEIGHT);
    bottom.addColorStop(0, "rgba(12, 49, 58, 0)");
    bottom.addColorStop(0.36, "rgba(12, 49, 58, 0.88)");
    bottom.addColorStop(1, NAVY_DEEP);
    ctx.fillStyle = bottom;
    ctx.fillRect(0, CARD_HEIGHT * fadeFrom, CARD_WIDTH, CARD_HEIGHT * (1 - fadeFrom));
    return;
  }

  // No photo: the mockup's navy, with a soft gold glow in the bottom corner
  const base = ctx.createLinearGradient(CARD_WIDTH * 0.15, 0, CARD_WIDTH * 0.85, CARD_HEIGHT);
  base.addColorStop(0, TEAL);
  base.addColorStop(0.4, NAVY);
  base.addColorStop(1, NAVY_DEEP);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glow = ctx.createRadialGradient(CARD_WIDTH * 0.82, CARD_HEIGHT * 0.94, 0, CARD_WIDTH * 0.82, CARD_HEIGHT * 0.94, CARD_WIDTH * 0.62);
  glow.addColorStop(0, "rgba(247, 172, 64, 0.26)");
  glow.addColorStop(1, "rgba(247, 172, 64, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement) {
  const height = 150;
  const width = (logo.naturalWidth / logo.naturalHeight) * height;
  ctx.drawImage(logo, MARGIN - 6, 72, width, height);
}

/** "1ST PLACE", with the ordinal's letters smaller, in gold */
function drawPlace(ctx: CanvasRenderingContext2D, place: 1 | 2, baseline: number) {
  const big = 230;
  ctx.fillStyle = GOLD;
  ctx.font = font(400, big, DISPLAY);
  ctx.fillText(String(place), MARGIN, baseline);
  let x = MARGIN + ctx.measureText(String(place)).width + 4;
  ctx.font = font(400, big * 0.5, DISPLAY);
  ctx.fillText(place === 1 ? "ST" : "ND", x, baseline);
  x += ctx.measureText(place === 1 ? "ST" : "ND").width + 28;
  ctx.font = font(400, big, DISPLAY);
  ctx.fillText("PLACE", x, baseline);
}

function drawAward(ctx: CanvasRenderingContext2D, subject: Extract<ShareSubject, { kind: "award" }>) {
  let y = CARD_HEIGHT - 96;

  // 142 PTS   8 sessions
  ctx.fillStyle = CREAM;
  ctx.font = font(400, 112, DISPLAY);
  const pts = `${subject.points} PTS`;
  ctx.fillText(pts, MARGIN, y);
  const ptsWidth = ctx.measureText(pts).width;
  ctx.globalAlpha = 0.75;
  ctx.font = font(500, 36, BODY);
  ctx.fillText(`${subject.sessions} session${subject.sessions === 1 ? "" : "s"}`, MARGIN + ptsWidth + 28, y);
  ctx.globalAlpha = 1;

  // Hairline
  y -= 112 + 34;
  ctx.fillStyle = "rgba(246, 239, 218, 0.28)";
  ctx.fillRect(MARGIN, y, TEXT_WIDTH, 2);

  // Women's Team · September 2026
  y -= 46;
  ctx.fillStyle = CREAM;
  ctx.globalAlpha = 0.88;
  const subtitle = `${subject.groupName} · ${formatMonth(subject.month, "long")}`;
  fitFont(ctx, subtitle, 500, BODY, 40, 28);
  ctx.fillText(clip(ctx, subtitle, TEXT_WIDTH), MARGIN, y);
  ctx.globalAlpha = 1;

  // TALIA TAWFIK
  const name = subject.playerName.toUpperCase();
  y -= 40 + 20;
  const nameSize = fitFont(ctx, name, 400, DISPLAY, 116, 64);
  ctx.fillText(clip(ctx, name, TEXT_WIDTH), MARGIN, y);

  // 1ST PLACE
  y -= nameSize * 0.88 + 26;
  drawPlace(ctx, subject.place, y);
}

function drawMedallion(ctx: CanvasRenderingContext2D, icon: HTMLImageElement | null, cx: number, cy: number, r: number) {
  const fill = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  fill.addColorStop(0, branding.colors.accent[400]);
  fill.addColorStop(1, GOLD_DEEP);
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  if (icon) {
    const size = r * 1.1;
    ctx.drawImage(icon, cx - size / 2, cy - size / 2, size, size);
  }
}

function drawBadge(ctx: CanvasRenderingContext2D, subject: Extract<ShareSubject, { kind: "badge" }>, icon: HTMLImageElement | null) {
  let y = CARD_HEIGHT - 96;

  // Earned 25 September 2026
  ctx.fillStyle = CREAM;
  ctx.globalAlpha = 0.78;
  ctx.font = font(500, 36, BODY);
  ctx.fillText(`Earned ${formatBadgeDate(subject.earnedOn, "long")}`, MARGIN, y);
  ctx.globalAlpha = 1;

  // TALIA TAWFIK
  const name = subject.playerName.toUpperCase();
  y -= 36 + 34;
  const nameSize = fitFont(ctx, name, 400, DISPLAY, 84, 52);
  ctx.fillText(clip(ctx, name, TEXT_WIDTH), MARGIN, y);

  // Hairline
  y -= nameSize * 0.88 + 30;
  ctx.fillStyle = "rgba(246, 239, 218, 0.28)";
  ctx.fillRect(MARGIN, y, TEXT_WIDTH, 2);

  // Attended 25 sessions
  y -= 40;
  ctx.fillStyle = CREAM;
  ctx.globalAlpha = 0.9;
  fitFont(ctx, subject.description, 500, BODY, 44, 30);
  ctx.fillText(clip(ctx, subject.description, TEXT_WIDTH), MARGIN, y);
  ctx.globalAlpha = 1;

  // COURT REGULAR
  const badgeName = subject.name.toUpperCase();
  y -= 44 + 24;
  ctx.fillStyle = GOLD;
  const badgeSize = fitFont(ctx, badgeName, 400, DISPLAY, 180, 84);
  ctx.fillText(clip(ctx, badgeName, TEXT_WIDTH), MARGIN, y);

  // The medallion
  const r = 92;
  y -= badgeSize * 0.88 + 40;
  drawMedallion(ctx, icon, MARGIN + r, y - r, r);

  // BADGE EARNED
  y -= r * 2 + 44;
  ctx.fillStyle = GOLD;
  ctx.font = font(600, 30, BODY);
  drawSpaced(ctx, "BADGE EARNED", MARGIN, y, 9);
}

/**
 * Draws the whole card. Call loadCardFonts() first. The badge icon is an image of the
 * badge's white line icon; the logo is /images/logo-cream.png.
 */
export function drawShareCard(
  canvas: HTMLCanvasElement,
  subject: ShareSubject,
  images: { logo: HTMLImageElement; photo: HTMLImageElement | null; badgeIcon?: HTMLImageElement | null }
) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the card");

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  drawBackground(ctx, images.photo, subject.kind === "award" ? 0.34 : 0.16);
  drawLogo(ctx, images.logo);
  if (subject.kind === "award") drawAward(ctx, subject);
  else drawBadge(ctx, subject, images.badgeIcon ?? null);
}

/** The card as a JPEG file, ready for the share sheet or a download */
export function cardFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], fileName, { type: "image/jpeg" })) : reject(new Error("Couldn't make the image"))),
      "image/jpeg",
      0.92
    );
  });
}
