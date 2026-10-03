"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isLoadableRange, loadBirthdays } from "@/lib/birthdays/load";
import type { BirthdayEntry } from "@/lib/birthdays/celebrations";

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

  return profile ? { id: profile.id as string, role: profile.role as string } : null;
}

/** Sessions a coach sees on their schedule: their groups' sessions and private sessions they run */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function coachSessionIds(admin: any, coachId: string): Promise<Set<string>> {
  const { data: coachGroups } = await admin
    .from("coach_groups")
    .select("group_id")
    .eq("coach_id", coachId)
    .eq("is_active", true);
  const groupIds = ((coachGroups ?? []) as { group_id: string }[]).map((cg) => cg.group_id);

  const privateFilter = `and(session_type.eq.private,coach_id.eq.${coachId})`;
  const { data: sessions } = await admin
    .from("schedule_sessions")
    .select("id")
    .or(groupIds.length > 0 ? `group_id.in.(${groupIds.join(",")}),${privateFilter}` : privateFilter);
  return new Set(((sessions ?? []) as { id: string }[]).map((s) => s.id));
}

/**
 * Birthdays to celebrate for the dates `from`..`to` (YYYY-MM-DD, inclusive).
 * Admins get every entry; coaches only get celebrations on sessions they coach.
 * A reminder is never worth breaking the page over, so failures return none.
 */
export async function getBirthdays(from: string, to: string): Promise<BirthdayEntry[]> {
  const user = await getCurrentUserRole();
  if (!user || (user.role !== "admin" && user.role !== "coach")) return [];
  if (!isLoadableRange(from, to)) return [];

  try {
    const admin = createAdminClient();
    const entries = await loadBirthdays(admin, from, to);
    if (user.role === "admin") return entries;

    const visible = await coachSessionIds(admin, user.id);
    return entries.filter((e) => e.session && visible.has(e.session.id));
  } catch (err) {
    console.error("getBirthdays failed", err);
    return [];
  }
}
