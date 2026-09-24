"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

function parseIncomeForm(formData: FormData) {
  const amount = parseFloat(formData.get("amount") as string);
  if (!amount || amount <= 0) return { error: "Amount must be greater than 0" };

  const categoryId = formData.get("category_id") as string;
  if (!categoryId) return { error: "Category is required" };

  return {
    values: {
      category_id: categoryId,
      description: (formData.get("description") as string)?.trim() || null,
      amount,
      income_date: (formData.get("income_date") as string) || new Date().toISOString().split("T")[0],
      notes: (formData.get("notes") as string)?.trim() || null,
    },
  };
}

// ═══════════════════════════════════════
// INCOME MANAGEMENT
// ═══════════════════════════════════════

export async function createIncome(formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const parsed = parseIncomeForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("income").insert({
    ...parsed.values,
    created_by: user!.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function updateIncome(id: string, formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const parsed = parseIncomeForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("income").update(parsed.values).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function deleteIncome(id: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("income")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

// ═══════════════════════════════════════
// INCOME CATEGORY MANAGEMENT
// ═══════════════════════════════════════

export async function createIncomeCategory(formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Category name is required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data, error } = await supabase
    .from("income_categories")
    .insert({ name, icon: (formData.get("icon") as string)?.trim() || null })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin/expenses");
  return { success: true, id: data.id as string };
}

export async function updateIncomeCategory(id: string, formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Category name is required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("income_categories")
    .update({
      name,
      icon: (formData.get("icon") as string)?.trim() || null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin/expenses");
  return { success: true };
}

export async function toggleIncomeCategoryActive(id: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Get current state
  const { data: category, error: fetchError } = await supabase
    .from("income_categories")
    .select("is_active")
    .eq("id", id)
    .single();

  if (fetchError) return { error: fetchError.message };

  const { error } = await supabase
    .from("income_categories")
    .update({ is_active: !category.is_active })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  return { success: true };
}
