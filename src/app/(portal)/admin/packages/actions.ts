"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPackage(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase.from("packages").insert({
    name: formData.get("name") as string,
    session_count: Number(formData.get("session_count")),
    validity_days: Number(formData.get("validity_days")),
    price: Number(formData.get("price")),
    description: (formData.get("description") as string) || null,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/packages");
  return { success: true };
}

export async function updatePackage(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const id = formData.get("id") as string;
  const { error } = await supabase
    .from("packages")
    .update({
      name: formData.get("name") as string,
      session_count: Number(formData.get("session_count")),
      validity_days: Number(formData.get("validity_days")),
      price: Number(formData.get("price")),
      description: (formData.get("description") as string) || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/packages");
  return { success: true };
}

export async function togglePackageStatus(id: string, isActive: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("packages")
    .update({ is_active: !isActive })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/packages");
  return { success: true };
}
