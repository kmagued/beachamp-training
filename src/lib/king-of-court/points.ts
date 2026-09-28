// Reading the points typed into a King of Court score box.

/** The most points a player can score in one session */
export const MAX_POINTS = 999;

const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

/** Phones set to Arabic type Eastern Arabic digits (٠-٩, or Persian ۰-۹); read them as 0-9 */
function toWesternDigits(text: string): string {
  return text.replace(EASTERN_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * A score box's text as points: null when blank (the player didn't play), a whole
 * number 0-999, or "invalid" for anything else (decimals, signs, exponents, words).
 */
export function parsePoints(input: string): number | null | "invalid" {
  const text = toWesternDigits(input.trim());
  if (text === "") return null;
  if (!/^\d{1,3}$/.test(text)) return "invalid";
  return Number(text);
}

/** Whether a value can be stored as points: the server's check on what the client sent */
export function isValidPoints(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_POINTS;
}
