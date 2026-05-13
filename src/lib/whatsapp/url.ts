/**
 * Build a wa.me deep link.
 * - Strips all non-digits (keeps a leading +). Egyptian numbers starting with 0
 *   are converted to 20 country code.
 * - If `text` is provided and non-empty, appends `?text=<encoded>`.
 */
export function buildWhatsAppUrl(phone: string, text?: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("0")) cleaned = "20" + cleaned.slice(1);
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);

  const base = `https://wa.me/${cleaned}`;
  if (text && text.trim().length > 0) {
    return `${base}?text=${encodeURIComponent(text)}`;
  }
  return base;
}
