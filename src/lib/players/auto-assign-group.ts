"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSystemSetting } from "@/lib/settings/system-settings";
import { notifyAdmins } from "@/app/_actions/notifications";

export type AutoAssignResult =
  | { assigned: true; groupId: string; groupName: string }
  | { assigned: false; reason: "no_default" | "group_full"; groupName?: string };

/**
 * Assigns a newly-created player to the configured default group for their gender.
 * Failure is soft: never throws, never blocks player creation. Notifies admins instead.
 */
export async function autoAssignGenderGroup(
  playerId: string,
  playerName: string,
  gender: "male" | "female"
): Promise<AutoAssignResult> {
  const settingKey = gender === "male" ? "default_male_group_id" : "default_female_group_id";
  const setting = await getSystemSetting<{ group_id: string }>(settingKey);

  if (!setting?.group_id) {
    await notifyAdmins({
      title: "Auto-assign skipped: no default group",
      body: `${playerName} (${gender}) registered but no default ${gender} group is configured. Open the groups page to set one.`,
      type: "system",
      link: "/admin/groups",
    });
    return { assigned: false, reason: "no_default" };
  }

  const groupId = setting.group_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  const [{ data: group }, { count: currentCount }] = await Promise.all([
    admin.from("groups").select("name, max_players").eq("id", groupId).maybeSingle(),
    admin
      .from("group_players")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("is_active", true),
  ]);

  if (!group) {
    await notifyAdmins({
      title: "Auto-assign failed: default group missing",
      body: `${playerName} (${gender}) registered but the configured default ${gender} group no longer exists. Reconfigure on the groups page.`,
      type: "system",
      link: "/admin/groups",
    });
    return { assigned: false, reason: "no_default" };
  }

  if ((currentCount ?? 0) >= (group.max_players ?? 0)) {
    await notifyAdmins({
      title: "Auto-assign skipped: group full",
      body: `${playerName} (${gender}) could not be auto-assigned because group "${group.name}" is at capacity (${currentCount}/${group.max_players}). Assign manually or set a different default group.`,
      type: "system",
      link: `/admin/players/${playerId}`,
    });
    return { assigned: false, reason: "group_full", groupName: group.name };
  }

  const { error } = await admin.from("group_players").insert({
    group_id: groupId,
    player_id: playerId,
    is_active: true,
  });

  if (error) {
    console.error("[auto-assign] insert failed:", error);
    await notifyAdmins({
      title: "Auto-assign failed",
      body: `${playerName} (${gender}) could not be auto-assigned to "${group.name}": ${error.message}`,
      type: "system",
      link: `/admin/players/${playerId}`,
    });
    return { assigned: false, reason: "group_full", groupName: group.name };
  }

  return { assigned: true, groupId, groupName: group.name };
}
