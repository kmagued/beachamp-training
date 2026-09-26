"use server";

import type { MerchSubcategory } from "@/lib/config/merch";
import { reorderCategories } from "@/lib/merch/categories";
import { assertAdmin, revalidateMerch } from "../_lib/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function categoryName(supabase: any, categoryId: string) {
  const { data } = await supabase.from("merch_categories").select("name").eq("id", categoryId).maybeSingle();
  return (data?.name as string | undefined) ?? "this category";
}

// ── Categories ───────────────────────────────────────────────────────────

export async function createMerchCategory(name: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a category name" };

  const { data: last } = await supabase
    .from("merch_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("merch_categories")
    .insert({ name: trimmed, sort_order: (last?.sort_order ?? -1) + 1 });
  if (error) {
    if (error.code === "23505") return { error: `${trimmed} already exists` };
    return { error: error.message };
  }

  revalidateMerch();
  return { success: true as const };
}

export async function renameMerchCategory(id: string, name: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a category name" };

  const { error } = await supabase.from("merch_categories").update({ name: trimmed }).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: `${trimmed} already exists` };
    return { error: error.message };
  }

  revalidateMerch();
  return { success: true as const };
}

export async function deleteMerchCategory(id: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  // Sub-categories and products point at the category with ON DELETE RESTRICT
  const { error } = await supabase.from("merch_categories").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "Can't delete: sub-categories or products still use it. Rename it instead." };
    return { error: error.message };
  }

  revalidateMerch();
  return { success: true as const };
}

/** Moves a category one place in the order players see the category chips */
export async function moveMerchCategory(id: string, direction: "up" | "down") {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const { data: categories, error: loadErr } = await supabase
    .from("merch_categories")
    .select("id, sort_order, created_at");
  if (loadErr) return { error: loadErr.message };

  const updates = reorderCategories(categories ?? [], id, direction);
  if (!updates) return { success: true as const };

  for (const u of updates) {
    const { error } = await supabase.from("merch_categories").update({ sort_order: u.sort_order }).eq("id", u.id);
    if (error) return { error: error.message };
  }

  revalidateMerch();
  return { success: true as const };
}

// ── Sub-categories ───────────────────────────────────────────────────────

export async function createMerchSubcategory(categoryId: string, name: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a sub-category name" };
  if (!categoryId) return { error: "Choose a category first" };

  const { data, error } = await supabase
    .from("merch_subcategories")
    .insert({ category_id: categoryId, name: trimmed })
    .select("id, category_id, name")
    .single();

  if (error) {
    if (error.code === "23505") return { error: `${trimmed} already exists in ${await categoryName(supabase, categoryId)}` };
    if (error.code === "23503") return { error: "That category no longer exists" };
    return { error: error.message };
  }

  revalidateMerch();
  return { success: true as const, subcategory: data as MerchSubcategory };
}

export async function renameMerchSubcategory(id: string, name: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Enter a sub-category name" };

  const { data, error } = await supabase
    .from("merch_subcategories")
    .update({ name: trimmed })
    .eq("id", id)
    .select("category_id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const { data: sub } = await supabase.from("merch_subcategories").select("category_id").eq("id", id).maybeSingle();
      return { error: `${trimmed} already exists in ${await categoryName(supabase, sub?.category_id ?? "")}` };
    }
    return { error: error.message };
  }
  if (!data) return { error: "That sub-category no longer exists" };

  revalidateMerch();
  return { success: true as const };
}

export async function deleteMerchSubcategory(id: string) {
  const { error: authErr, supabase } = await assertAdmin();
  if (authErr) return { error: authErr };

  // Products (deleted ones too, which keep their past sales) point at it with ON DELETE RESTRICT
  const { error } = await supabase.from("merch_subcategories").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "Can't delete: products or past sales use it. Rename it instead." };
    return { error: error.message };
  }

  revalidateMerch();
  return { success: true as const };
}
