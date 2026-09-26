"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { MERCH_CATEGORIES, MERCH_SIZES } from "@/lib/config/merch";

const BUCKET = "merch-images";

async function assertAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", supabase: null, userId: null } as const;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || me.role !== "admin") return { error: "Not authorized", supabase: null, userId: null } as const;
  return { error: null, supabase, userId: user.id } as const;
}

function revalidate() {
  revalidatePath("/admin/merch");
  revalidatePath("/player/merch");
}

function parseFields(formData: FormData) {
  const name = ((formData.get("name") as string) || "").trim();
  const category = (formData.get("category") as string) || "";
  const subcategoryId = (formData.get("subcategory_id") as string) || "";
  const priceRaw = (formData.get("price") as string) ?? "";
  const price = Number(priceRaw);
  const description = ((formData.get("description") as string) || "").trim() || null;
  const sizes = formData
    .getAll("sizes")
    .map(String)
    .filter((s) => (MERCH_SIZES as readonly string[]).includes(s));

  if (!name) return { error: "Add a name for the item" } as const;
  if (!MERCH_CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category" } as const;
  if (!subcategoryId) return { error: "Choose a sub-category, e.g. Hoodie" } as const;
  if (priceRaw === "" || !Number.isFinite(price) || price < 0) return { error: "Enter a price of 0 or more" } as const;
  if (sizes.length === 0) return { error: "Pick at least one size, or choose One size" } as const;

  return {
    error: null,
    fields: {
      name,
      category,
      subcategory_id: subcategoryId,
      price,
      description,
      sizes,
      is_active: formData.get("is_active") === "on",
      is_sold_out: formData.get("is_sold_out") === "on",
    },
  } as const;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkSubcategory(supabase: any, subcategoryId: string, category: string) {
  const { data } = await supabase.from("merch_subcategories").select("category").eq("id", subcategoryId).maybeSingle();
  if (!data) return "That sub-category no longer exists";
  if (data.category !== category) return "The sub-category doesn't belong to the chosen category";
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

  const parsed = parseFields(formData);
  if (parsed.error) return { error: parsed.error };
  const subErr = await checkSubcategory(supabase, parsed.fields.subcategory_id, parsed.fields.category);
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

  const { error } = await supabase.from("merch_items").insert({
    ...parsed.fields,
    image_path: imagePath,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
    created_by: userId,
  });
  if (error) {
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    return { error: error.message };
  }

  revalidate();
  return { success: true };
}

export async function updateMerchItem(formData: FormData) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const id = formData.get("id") as string;
  if (!id) return { error: "Item not found" };

  const parsed = parseFields(formData);
  if (parsed.error) return { error: parsed.error };
  const subErr = await checkSubcategory(supabase, parsed.fields.subcategory_id, parsed.fields.category);
  if (subErr) return { error: subErr };

  const { data: existing } = await supabase.from("merch_items").select("image_path").eq("id", id).single();
  if (!existing) return { error: "Item not found" };

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
    .update({ ...parsed.fields, image_path: imagePath, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (replacingImage && imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    return { error: error.message };
  }

  if (replacingImage && existing.image_path) {
    await supabase.storage.from(BUCKET).remove([existing.image_path]);
  }

  revalidate();
  return { success: true };
}

export async function toggleMerchVisibility(id: string, isActive: boolean) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const { error } = await supabase
    .from("merch_items")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return { success: true };
}

export async function deleteMerchItem(id: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const { data: item } = await supabase.from("merch_items").select("image_path").eq("id", id).single();
  if (!item) return { error: "Item not found" };

  // Items with income logged are only marked deleted, so past income keeps its item
  const { count } = await supabase
    .from("income")
    .select("id", { count: "exact", head: true })
    .eq("merch_item_id", id);
  if (count) {
    const { error } = await supabase
      .from("merch_items")
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidate();
    revalidatePath("/admin/finances");
    return { success: true };
  }

  const { error } = await supabase.from("merch_items").delete().eq("id", id);
  if (error) return { error: error.message };
  if (item.image_path) await supabase.storage.from(BUCKET).remove([item.image_path]);

  revalidate();
  return { success: true };
}

export async function createMerchSubcategory(category: string, name: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a sub-category name" };
  if (!MERCH_CATEGORIES.some((c) => c.value === category)) return { error: "Choose a category first" };

  const { data, error } = await supabase
    .from("merch_subcategories")
    .insert({ category, name: trimmed })
    .select("id, category, name")
    .single();

  if (error) {
    if (error.code === "23505") return { error: `"${trimmed}" already exists in this category` };
    return { error: error.message };
  }

  revalidate();
  return { success: true, subcategory: data as { id: string; category: string; name: string } };
}
