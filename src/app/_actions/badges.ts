"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateBadge, type BadgeField, type BadgeFields, type BadgeInput } from "@/lib/badges/validate";
import { groupHolders, type BadgeHolder, type HeldTierRow } from "@/lib/badges/holders";
import type { TierNumber } from "@/lib/badges/config";

// ── Helper: get current user role ──
async function getCurrentUserRole() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  return profile ? { id: profile.id, role: profile.role as string } : null;
}

function requireAdmin(user: { role: string } | null) {
  if (!user || user.role !== "admin") {
    return { error: "Unauthorized: admin access required" };
  }
  return null;
}

type BadgeResult = { success: true } | { error: string; field?: BadgeField; tier?: number };

function revalidateBadges() {
  for (const path of ["/admin/badges", "/player/achievements", "/player/dashboard"]) {
    revalidatePath(path);
  }
}

// 23505 is badges_name_unique: names are unique ignoring case and surrounding spaces.
// save_badge's own refusals (23514) are written to be shown to the admin as they are.
function saveError(error: { code?: string; message: string }, name: string): BadgeResult {
  if (error.code === "23505") return { error: `There's already a badge called ${name}`, field: "name" };
  return { error: error.message };
}

// save_badge writes the badge and all its tiers in one transaction, then re-checks every
// player the badge could affect, so the admin sees an error if that fails
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveBadge(admin: any, id: string | null, fields: BadgeFields, createdBy: string): Promise<BadgeResult> {
  const { error } = await admin.rpc("save_badge", {
    p_id: id,
    p_name: fields.name,
    p_icon: fields.icon,
    p_measure: fields.measure,
    p_tiers: fields.tiers,
    p_created_by: createdBy,
  });
  if (error) return saveError(error, fields.name);
  revalidateBadges();
  return { success: true };
}

// ═══════════════════════════════════════
// BADGES (Admin only)
// ═══════════════════════════════════════

// A new badge counts from today (its counts_from day), so players start from zero
export async function createBadge(input: BadgeInput): Promise<BadgeResult> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  const checked = validateBadge(input);
  if (!checked.ok) return { error: checked.error, field: checked.field, tier: checked.tier };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return saveBadge(createAdminClient() as any, null, checked.value, user!.id);
}

// The measure and start day never change. Raising a number or removing a tier takes it
// back from players who no longer qualify; new credits apply only to future earners.
export async function updateBadge(id: string, input: BadgeInput): Promise<BadgeResult> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;
  if (typeof id !== "string" || !id) return { error: "Invalid badge" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: existing, error: readErr } = await admin.from("badges").select("measure").eq("id", id).maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "That badge no longer exists" };

  const checked = validateBadge(input, { currentMeasure: existing.measure });
  if (!checked.ok) return { error: checked.error, field: checked.field, tier: checked.tier };

  return saveBadge(admin, id, checked.value, user!.id);
}

// Holders lose its tiers and their credits (ON DELETE CASCADE); unread notifications
// for them are removed by the player_badges_drop_notification trigger.
export async function deleteBadge(id: string): Promise<BadgeResult> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;
  if (typeof id !== "string" || !id) return { error: "Invalid badge" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: removed, error } = await admin.from("badges").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!removed || removed.length === 0) return { error: "That badge no longer exists" };

  revalidateBadges();
  return { success: true };
}

// Who holds a badge, for the holders drawer: one row per player with their highest tier.
// Loaded when the drawer opens, not with the page. PostgREST returns at most 1000 tier
// rows, which is far beyond this academy's players times five tiers.
export async function loadBadgeHolders(badgeId: string): Promise<{ holders: BadgeHolder[] } | { error: string }> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;
  if (typeof badgeId !== "string" || !badgeId) return { error: "Invalid badge" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from("player_badges")
    .select("player_id, earned_on, badge_tiers!inner(tier, badge_id), profiles(first_name, last_name), credit_transactions(amount)")
    .eq("badge_tiers.badge_id", badgeId);
  if (error) return { error: `Couldn't load who holds this badge: ${error.message}` };

  const rows: HeldTierRow[] = (
    (data || []) as {
      player_id: string;
      earned_on: string;
      badge_tiers: { tier: TierNumber };
      profiles: { first_name: string | null; last_name: string | null } | null;
      credit_transactions: { amount: number }[] | null;
    }[]
  ).map((r) => ({
    player_id: r.player_id,
    first_name: r.profiles?.first_name ?? null,
    last_name: r.profiles?.last_name ?? null,
    tier: r.badge_tiers.tier,
    earned_on: r.earned_on,
    paid: (r.credit_transactions ?? []).reduce((sum, c) => sum + c.amount, 0),
  }));
  return { holders: groupHolders(rows) };
}
