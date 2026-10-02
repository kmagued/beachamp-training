"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateBadge, type BadgeField, type BadgeInput } from "@/lib/badges/validate";

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

type BadgeResult = { success: true } | { error: string; field?: BadgeField };

function revalidateBadges() {
  for (const path of ["/admin/badges", "/player/achievements", "/player/dashboard"]) {
    revalidatePath(path);
  }
}

// 23505 is badges_name_unique: names are unique ignoring case and surrounding spaces
function saveError(error: { code?: string; message: string }, name: string): BadgeResult {
  if (error.code === "23505") return { error: `There's already a badge called ${name}`, field: "name" };
  return { error: error.message };
}

// ═══════════════════════════════════════
// BADGES (Admin only)
// ═══════════════════════════════════════

// The database awards a new badge to everyone who already meets it since today (its
// counts_from day), inside this insert, so the admin sees an error if that fails.
export async function createBadge(input: BadgeInput): Promise<BadgeResult> {
  const user = await getCurrentUserRole();
  const authErr = requireAdmin(user);
  if (authErr) return authErr;

  const checked = validateBadge(input);
  if (!checked.ok) return { error: checked.error, field: checked.field };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.from("badges").insert({ ...checked.value, created_by: user!.id });
  if (error) return saveError(error, checked.value.name);

  revalidateBadges();
  return { success: true };
}

// The measure and start day never change. A new number re-checks every holder and
// candidate in the database; new credits apply only to players who earn it from now on.
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
  if (!checked.ok) return { error: checked.error, field: checked.field };

  const { name, icon, threshold, credits } = checked.value;
  const { error } = await admin.from("badges").update({ name, icon, threshold, credits }).eq("id", id);
  if (error) return saveError(error, name);

  revalidateBadges();
  return { success: true };
}

// Holders lose the badge and its credits (ON DELETE CASCADE); unread notifications for
// it are removed by the player_badges_drop_notification trigger.
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
