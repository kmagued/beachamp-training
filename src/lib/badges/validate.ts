// Checks the admin's badge form before it reaches the database, with a message for the
// field (or tier) at fault. Mirrors the badges table's checks and save_badge().

import {
  BADGE_LIMITS,
  MAX_TIERS,
  MEASURES,
  TIERS,
  isBadgeIcon,
  isMeasure,
  type BadgeIconKey,
  type Measure,
  type TierNumber,
} from "./config";

export interface TierInput {
  threshold: string;
  credits: string;
}

export interface BadgeInput {
  name: string;
  icon: string;
  measure: string;
  /** Bronze first */
  tiers: TierInput[];
}

export interface BadgeFields {
  name: string;
  icon: BadgeIconKey;
  measure: Measure;
  tiers: { threshold: number; credits: number }[];
}

export type BadgeField = "name" | "icon" | "measure" | "tiers";

export type BadgeValidation =
  | { ok: true; value: BadgeFields }
  /** tier: the index of the tier at fault, when it's one tier's number or credits */
  | { ok: false; field: BadgeField; tier?: number; error: string };

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

  if (input.tiers.length === 0) return { ok: false, field: "tiers", error: "Add at least one tier" };
  if (input.tiers.length > MAX_TIERS) return { ok: false, field: "tiers", error: `A badge has at most ${MAX_TIERS} tiers` };

  const min = MEASURES[input.measure].min;
  const tiers: BadgeFields["tiers"] = [];
  for (const [i, tier] of input.tiers.entries()) {
    const threshold = wholeNumber(tier.threshold);
    if (threshold === null || threshold < min || threshold > BADGE_LIMITS.thresholdMax) {
      return {
        ok: false,
        field: "tiers",
        tier: i,
        error: `Enter a whole number from ${min} to ${BADGE_LIMITS.thresholdMax}`,
      };
    }
    if (i > 0 && threshold <= tiers[i - 1].threshold) {
      return {
        ok: false,
        field: "tiers",
        tier: i,
        error: `${TIERS[(i + 1) as TierNumber].label} needs a higher number than ${TIERS[i as TierNumber].label}`,
      };
    }

    const credits = tier.credits.trim() === "" ? 0 : wholeNumber(tier.credits);
    if (credits === null || credits < 0 || credits > BADGE_LIMITS.creditsMax) {
      return {
        ok: false,
        field: "tiers",
        tier: i,
        error: `Enter a whole number of credits from 0 to ${BADGE_LIMITS.creditsMax}`,
      };
    }
    tiers.push({ threshold, credits });
  }

  return { ok: true, value: { name, icon: input.icon, measure: input.measure, tiers } };
}
