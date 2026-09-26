"use server";

import { parseProductForm, planSizeChanges } from "@/lib/merch/product-form";
import { areValidCounts, restockTotal, type RecountChange } from "@/lib/merch/stock";
import { assertAdmin, revalidateMerch } from "./_lib/admin";

const BUCKET = "merch-images";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkSubcategory(supabase: any, subcategoryId: string, categoryId: string) {
  const { data } = await supabase.from("merch_subcategories").select("category_id").eq("id", subcategoryId).maybeSingle();
  if (!data) return "That sub-category no longer exists";
  if (data.category_id !== categoryId) return "The sub-category doesn't belong to the chosen category";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadImage(supabase: any, file: File) {
  if (!file.type.startsWith("image/")) return { error: "Photo must be an image" };
  if (file.size > 5 * 1024 * 1024) return { error: "Photo must be under 5MB" };
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) return { error: error.message };
  return { path };
}

export async function createMerchItem(formData: FormData) {
  const { error: authErr, supabase, userId } = await assertAdmin();
  if (authErr) return { error: authErr };

  const parsed = parseProductForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { sizes, opening, ...fields } = parsed.fields;
  const subErr = await checkSubcategory(supabase, fields.subcategory_id, fields.category_id);
  if (subErr) return { error: subErr };

  let imagePath: string | null = null;
  const file = formData.get("image") as File | null;
  if (file && file.size > 0) {
    const up = await uploadImage(supabase, file);
    if (up.error) return { error: up.error };
    imagePath = up.path!;
  }

  const { data: maxRow } = await supabase
    .from("merch_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: item, error } = await supabase
    .from("merch_items")
    .insert({ ...fields, image_path: imagePath, sort_order: (maxRow?.sort_order ?? -1) + 1, created_by: userId })
    .select("id")
    .single();
  if (error || !item) {
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    return { error: error?.message ?? "Couldn't create the product" };
  }

  const { error: stockErr } = await supabase
    .from("merch_stock")
    .insert(sizes.map((size) => ({ item_id: item.id, size, quantity: opening[size] ?? 0 })));
  if (stockErr) {
    // A product without stock rows has no sizes; undo rather than leave it half-made
    await supabase.from("merch_items").delete().eq("id", item.id);
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    return { error: stockErr.message };
  }

  revalidateMerch();
  return { success: true as const, id: item.id as string };
}

export async function updateMerchItem(formData: FormData) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const id = formData.get("id") as string;
  if (!id) return { error: "Product not found" };

  const parsed = parseProductForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { sizes, opening, ...fields } = parsed.fields;
  const subErr = await checkSubcategory(supabase, fields.subcategory_id, fields.category_id);
  if (subErr) return { error: subErr };

  const { data: existing } = await supabase
    .from("merch_items")
    .select("image_path, merch_stock(size)")
    .eq("id", id)
    .single();
  if (!existing) return { error: "Product not found" };

  let imagePath: string | null = existing.image_path;
  const file = formData.get("image") as File | null;
  const replacingImage = !!file && file.size > 0;
  if (replacingImage) {
    const up = await uploadImage(supabase, file);
    if (up.error) return { error: up.error };
    imagePath = up.path!;
  }

  const { error } = await supabase
    .from("merch_items")
    .update({ ...fields, image_path: imagePath, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (replacingImage && imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    return { error: error.message };
  }

  if (replacingImage && existing.image_path) {
    await supabase.storage.from(BUCKET).remove([existing.image_path]);
  }

  // Counts of sizes the product already had are never written here: stock changes go
  // through Restock / Recount so they can't overwrite a sale that just came in
  const existingSizes = ((existing.merch_stock ?? []) as { size: string }[]).map((s) => s.size);
  const { add, remove } = planSizeChanges(existingSizes, sizes);
  if (add.length) {
    const { error: addErr } = await supabase
      .from("merch_stock")
      .insert(add.map((size) => ({ item_id: id, size, quantity: opening[size] ?? 0 })));
    if (addErr) return { error: `Saved, but the new sizes couldn't be added: ${addErr.message}` };
  }
  if (remove.length) {
    const { error: removeErr } = await supabase.from("merch_stock").delete().eq("item_id", id).in("size", remove);
    if (removeErr) return { error: `Saved, but the removed sizes are still listed: ${removeErr.message}` };
  }

  revalidateMerch();
  return { success: true as const };
}

export async function toggleMerchVisibility(id: string, isActive: boolean) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const { error } = await supabase
    .from("merch_items")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateMerch();
  return { success: true as const };
}

export async function deleteMerchItem(id: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const { data: item } = await supabase.from("merch_items").select("image_path").eq("id", id).single();
  if (!item) return { error: "Product not found" };

  // Products with income logged are only marked deleted, so past sales keep their product
  const { count } = await supabase
    .from("income")
    .select("id", { count: "exact", head: true })
    .eq("merch_item_id", id);
  if (count) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("merch_items")
      .update({ deleted_at: now, is_active: false, updated_at: now })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidateMerch();
    return { success: true as const };
  }

  // Stock rows go with the product (ON DELETE CASCADE)
  const { error } = await supabase.from("merch_items").delete().eq("id", id);
  if (error) return { error: error.message };
  if (item.image_path) await supabase.storage.from(BUCKET).remove([item.image_path]);

  revalidateMerch();
  return { success: true as const };
}

/** Adds what arrived, e.g. { M: 10, L: 5 }, to the product's stock */
export async function restockMerch(itemId: string, added: Record<string, number>) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };
  if (!areValidCounts(Object.values(added))) return { error: "Arrivals must be whole numbers, 0 or more" };
  if (restockTotal(added) === 0) return { error: "Enter how many arrived" };

  const { error } = await supabase.rpc("merch_restock", { p_item_id: itemId, p_added: added });
  if (error) return { error: error.message };

  revalidateMerch();
  return { success: true as const };
}

/**
 * Sets exact counts after a shelf count. Each change carries the count the admin started
 * from; if a sale moved any of them meanwhile nothing is written (ok: false) and the
 * current counts come back so the panel can show them.
 */
export async function recountMerch(itemId: string, changes: RecountChange[]) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };
  if (changes.length === 0) return { error: "No counts changed" };
  if (!areValidCounts(changes.flatMap((c) => [c.expected, c.counted]))) {
    return { error: "Counts must be whole numbers, 0 or more" };
  }

  const { data, error } = await supabase.rpc("merch_recount", { p_item_id: itemId, p_counts: changes });
  if (error) return { error: error.message };

  revalidateMerch();
  return { success: true as const, ok: data.ok as boolean, stock: data.stock as Record<string, number> };
}
