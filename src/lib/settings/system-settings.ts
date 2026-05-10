"use server";

import { createAdminClient } from "@/lib/supabase/server";

export type SystemSettingKey = "default_male_group_id" | "default_female_group_id";

/** Read a setting. Returns null if unset. */
export async function getSystemSetting<T = Record<string, unknown>>(
  key: SystemSettingKey
): Promise<T | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T) ?? null;
}

/** Write a setting. Upserts on key. */
export async function setSystemSetting(
  key: SystemSettingKey,
  value: Record<string, unknown>
): Promise<{ error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.from("system_settings").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) return { error: error.message };
  return {};
}

/** Delete a setting. */
export async function clearSystemSetting(
  key: SystemSettingKey
): Promise<{ error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { error } = await admin.from("system_settings").delete().eq("key", key);
  if (error) return { error: error.message };
  return {};
}
