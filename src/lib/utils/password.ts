import { randomBytes } from "node:crypto";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => CHARSET[byte % CHARSET.length]).join("");
}
