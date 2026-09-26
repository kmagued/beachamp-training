"use server";

import type { MerchSubcategory } from "@/lib/config/merch";
import { assertAdmin, revalidateMerch } from "../_lib/admin";

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
    if (error.code === "23505") return { error: `"${trimmed}" already exists in this category` };
    if (error.code === "23503") return { error: "That category no longer exists" };
    return { error: error.message };
  }

  revalidateMerch();
  return { success: true as const, subcategory: data as MerchSubcategory };
}
