// Checks the admin's badge form before it reaches the database, with a message for the
// field at fault. Mirrors the badges table's CHECK constraints.

import { BADGE_LIMITS, MEASURES, isBadgeIcon, isMeasure, type BadgeIconKey, type Measure } from "./config";

export interface BadgeInput {
  name: string;
  icon: string;
  measure: string;
  threshold: string;
  credits: string;
}

export interface BadgeFields {
  name: string;
  icon: BadgeIconKey;
  measure: Measure;
  threshold: number;
  credits: number;
}

export type BadgeField = keyof BadgeInput;

export type BadgeValidation = { ok: true; value: BadgeFields } | { ok: false; field: BadgeField; error: string };

/** A whole number written plainly ("25"), or null */
function wholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** currentMeasure: set when editing, because a badge's measure can't change */
export function validateBadge(input: BadgeInput, opts: { currentMeasure?: string } = {}): BadgeValidation {
  const name = input.name.trim();
  if (!name) return { ok: false, field: "name", error: "Give the badge a name" };
  if (name.length > BADGE_LIMITS.nameMax) {
    return { ok: false, field: "name", error: `Keep the name to ${BADGE_LIMITS.nameMax} characters` };
  }

  if (!isBadgeIcon(input.icon)) return { ok: false, field: "icon", error: "Pick an icon" };

  if (!isMeasure(input.measure)) return { ok: false, field: "measure", error: "Pick what the badge measures" };
  if (opts.currentMeasure !== undefined && input.measure !== opts.currentMeasure) {
    return { ok: false, field: "measure", error: "A badge's measure can't be changed" };
  }

  const min = MEASURES[input.measure].min;
  const threshold = wholeNumber(input.threshold);
  if (threshold === null || threshold < min || threshold > BADGE_LIMITS.thresholdMax) {
    return {
      ok: false,
      field: "threshold",
      error: `Enter a whole number from ${min} to ${BADGE_LIMITS.thresholdMax}`,
    };
  }

  const credits = input.credits.trim() === "" ? 0 : wholeNumber(input.credits);
  if (credits === null || credits < 0 || credits > BADGE_LIMITS.creditsMax) {
    return {
      ok: false,
      field: "credits",
      error: `Enter a whole number of credits from 0 to ${BADGE_LIMITS.creditsMax}`,
    };
  }

  return { ok: true, value: { name, icon: input.icon, measure: input.measure, threshold, credits } };
}
