/**
 * The hourly court price the expense calculator starts from. Admins change it from the
 * calculator itself ("Save as default"); it is stored in system_settings under
 * `court_hourly_rate` as `{ rate }`. This constant only applies until a rate is saved.
 */
export const FALLBACK_COURT_HOURLY_RATE = 350;

/** A usable rate (finite and above zero), or null. */
export function parseCourtRate(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string" && input.trim() === "") return null;
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The rate stored in the system_settings row, or the fallback when unset or malformed. */
export function readCourtRateSetting(value: { rate?: unknown } | null): number {
  return parseCourtRate(value?.rate) ?? FALLBACK_COURT_HOURLY_RATE;
}
