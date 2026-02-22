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

// ═══════════════════════════════════════
// EXPENSE MANAGEMENT
// ═══════════════════════════════════════

export async function createExpense(formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const amount = parseFloat(formData.get("amount") as string);
  if (!amount || amount <= 0) return { error: "Amount must be greater than 0" };

  const description = (formData.get("description") as string)?.trim();
  if (!description) return { error: "Description is required" };

  const categoryId = formData.get("category_id") as string;
  if (!categoryId) return { error: "Category is required" };

  const expenseDate = formData.get("expense_date") as string;
  if (!expenseDate) return { error: "Date is required" };

  const isRecurring = formData.get("is_recurring") === "true";
  const recurrenceType = isRecurring ? (formData.get("recurrence_type") as string) : null;

  if (isRecurring && !recurrenceType) {
    return { error: "Recurrence type is required for recurring expenses" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("expenses").insert({
    category_id: categoryId,
    description,
    amount,
    expense_date: expenseDate,
    is_recurring: isRecurring,
    recurrence_type: recurrenceType,
    notes: (formData.get("notes") as string)?.trim() || null,
    court_count: formData.get("court_count") ? Number(formData.get("court_count")) : null,
    court_hours: formData.get("court_hours") ? Number(formData.get("court_hours")) : null,
    court_hourly_rate: formData.get("court_hourly_rate") ? Number(formData.get("court_hourly_rate")) : null,
    created_by: user!.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function updateExpense(id: string, formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const amount = parseFloat(formData.get("amount") as string);
  if (!amount || amount <= 0) return { error: "Amount must be greater than 0" };

  const description = (formData.get("description") as string)?.trim();
  if (!description) return { error: "Description is required" };

  const categoryId = formData.get("category_id") as string;
  if (!categoryId) return { error: "Category is required" };

  const expenseDate = formData.get("expense_date") as string;
  if (!expenseDate) return { error: "Date is required" };

  const isRecurring = formData.get("is_recurring") === "true";
  const recurrenceType = isRecurring ? (formData.get("recurrence_type") as string) : null;

  if (isRecurring && !recurrenceType) {
    return { error: "Recurrence type is required for recurring expenses" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("expenses")
    .update({
      category_id: categoryId,
      description,
      amount,
      expense_date: expenseDate,
      is_recurring: isRecurring,
      recurrence_type: recurrenceType,
      notes: (formData.get("notes") as string)?.trim() || null,
      court_count: formData.get("court_count") ? Number(formData.get("court_count")) : null,
      court_hours: formData.get("court_hours") ? Number(formData.get("court_hours")) : null,
      court_hourly_rate: formData.get("court_hourly_rate") ? Number(formData.get("court_hourly_rate")) : null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function deleteExpense(id: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("expenses")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

// ═══════════════════════════════════════
// EXPENSE CATEGORY MANAGEMENT
// ═══════════════════════════════════════

export async function createExpenseCategory(formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Category name is required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("expense_categories").insert({
    name,
    icon: (formData.get("icon") as string)?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin/expenses");
  return { success: true };
}

export async function updateExpenseCategory(id: string, formData: FormData) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Category name is required" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("expense_categories")
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

export async function toggleExpenseCategoryActive(id: string) {
  const user = await getCurrentUserRole();
  const authError = requireAdmin(user);
  if (authError) return authError;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Get current state
  const { data: category, error: fetchError } = await supabase
    .from("expense_categories")
    .select("is_active")
    .eq("id", id)
    .single();

  if (fetchError) return { error: fetchError.message };

  const { error } = await supabase
    .from("expense_categories")
    .update({ is_active: !category.is_active })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/expenses");
  return { success: true };
}
