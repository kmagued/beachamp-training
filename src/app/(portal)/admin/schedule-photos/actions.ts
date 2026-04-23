"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function assertAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", supabase: null, userId: null } as const;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || me.role !== "admin") return { error: "Not authorized", supabase: null, userId: null } as const;
  return { error: null, supabase, userId: user.id } as const;
}

export async function uploadSchedulePhoto(formData: FormData) {
  const { error: authErr, supabase, userId } = await assertAdmin();
  if (authErr) return { error: authErr };

  const groupId = (formData.get("group_id") as string) || "";
  const caption = ((formData.get("caption") as string) || "").trim() || null;
  const file = formData.get("file") as File | null;
  if (!groupId) return { error: "Please select a group" };
  if (!file || file.size === 0) return { error: "Please choose a photo" };
  if (file.size > 5 * 1024 * 1024) return { error: "Photo must be under 5MB" };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${groupId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("schedule-photos")
    .upload(path, file, { contentType: file.type });
  if (uploadErr) return { error: uploadErr.message };

  const { data: maxRow } = await supabase
    .from("schedule_photos")
    .select("sort_order")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? -1) + 1;

  const { error: insertErr } = await supabase.from("schedule_photos").insert({
    group_id: groupId,
    storage_path: path,
    caption,
    sort_order: nextSort,
    uploaded_by: userId,
  });
  if (insertErr) {
    await supabase.storage.from("schedule-photos").remove([path]);
    return { error: insertErr.message };
  }

  revalidatePath("/admin/schedule-photos");
  revalidatePath("/");
  return { success: true };
}

export async function deleteSchedulePhoto(id: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const { data: photo } = await supabase
    .from("schedule_photos")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!photo) return { error: "Photo not found" };

  const { error: delDbErr } = await supabase.from("schedule_photos").delete().eq("id", id);
  if (delDbErr) return { error: delDbErr.message };
  await supabase.storage.from("schedule-photos").remove([photo.storage_path]);

  revalidatePath("/admin/schedule-photos");
  revalidatePath("/");
  return { success: true };
}

export async function updateSchedulePhotoCaption(id: string, caption: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const trimmed = caption.trim();
  const { error } = await supabase
    .from("schedule_photos")
    .update({ caption: trimmed || null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/schedule-photos");
  revalidatePath("/");
  return { success: true };
}
