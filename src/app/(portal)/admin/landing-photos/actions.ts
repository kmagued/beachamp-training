"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/app/(portal)/admin/merch/_lib/admin";
import { LANDING_PHOTO_SLOTS, LANDING_PHOTOS_BUCKET } from "@/lib/config/landing-photos";

function isSlot(slot: number) {
  return (LANDING_PHOTO_SLOTS as readonly number[]).includes(slot);
}

/** Puts a photo in a spot, replacing the one there */
export async function uploadLandingPhoto(formData: FormData) {
  const { error: authErr, supabase, userId } = await assertAdmin();
  if (authErr) return { error: authErr };

  const slot = Number(formData.get("slot"));
  const file = formData.get("file") as File | null;
  if (!isSlot(slot)) return { error: "Unknown photo spot" };
  if (!file || file.size === 0) return { error: "Please choose a photo" };
  if (file.size > 5 * 1024 * 1024) return { error: "Photo must be under 5MB" };

  // A new name each time, so browsers and the CDN don't keep showing the old photo
  const ext = file.name.split(".").pop() || "jpg";
  const path = `slot-${slot}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(LANDING_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (uploadErr) return { error: uploadErr.message };

  const { data: old } = await supabase
    .from("landing_photos")
    .select("storage_path")
    .eq("slot", slot)
    .maybeSingle();

  const { error: saveErr } = await supabase
    .from("landing_photos")
    .upsert(
      { slot, storage_path: path, uploaded_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "slot" },
    );
  if (saveErr) {
    await supabase.storage.from(LANDING_PHOTOS_BUCKET).remove([path]);
    return { error: saveErr.message };
  }
  if (old) await supabase.storage.from(LANDING_PHOTOS_BUCKET).remove([old.storage_path]);

  revalidatePath("/admin/landing-photos");
  revalidatePath("/");
  return { success: true };
}

/** Empties a spot; the landing page shows the placeholder again */
export async function removeLandingPhoto(slot: number) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };
  if (!isSlot(slot)) return { error: "Unknown photo spot" };

  const { data: photo } = await supabase
    .from("landing_photos")
    .select("storage_path")
    .eq("slot", slot)
    .maybeSingle();
  if (!photo) return { error: "This spot has no photo" };

  const { error: delErr } = await supabase.from("landing_photos").delete().eq("slot", slot);
  if (delErr) return { error: delErr.message };
  await supabase.storage.from(LANDING_PHOTOS_BUCKET).remove([photo.storage_path]);

  revalidatePath("/admin/landing-photos");
  revalidatePath("/");
  return { success: true };
}
