// The Coaches page's "Existing player" search: what to match for what the admin typed.

export type PlayerSearch =
  | { kind: "full-name"; first: string; last: string }
  | { kind: "any"; text: string };

/**
 * "John Doe" matches first name John… and last name Doe…; a single word matches first
 * name, last name, email or phone, and so does a phone number typed with spaces or
 * dashes. Commas and brackets are dropped because they would break the PostgREST or()
 * filter. Fewer than 2 characters searches nothing.
 */
export function playerSearch(query: string): PlayerSearch | null {
  const clean = query.replace(/[,()]/g, " ").trim().replace(/\s+/g, " ");
  if (clean.length < 2) return null;
  if (/^\+?[\d\s-]+$/.test(clean)) return { kind: "any", text: clean.replace(/[\s-]/g, "") };
  const [first, ...rest] = clean.split(" ");
  return rest.length > 0 ? { kind: "full-name", first, last: rest.join(" ") } : { kind: "any", text: clean };
}

/** The or() filter for one word across name, email and phone */
export function anyFieldFilter(text: string): string {
  return ["first_name", "last_name", "email", "phone"].map((column) => `${column}.ilike.%${text}%`).join(",");
}
