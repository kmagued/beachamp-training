"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPromoCode(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const code = (formData.get("code") as string).toUpperCase().trim();
  const packageIdsRaw = formData.get("package_ids") as string;
  const maxUsesRaw = formData.get("max_uses") as string;
  const expiryRaw = formData.get("expiry_date") as string;

  const { error } = await supabase.from("promo_codes").insert({
    code,
    discount_type: formData.get("discount_type") as string,
    discount_value: Number(formData.get("discount_value")),
    expiry_date: expiryRaw || null,
    max_uses: maxUsesRaw ? Number(maxUsesRaw) : null,
    per_player_limit: Number(formData.get("per_player_limit")) || 1,
    package_ids: packageIdsRaw ? packageIdsRaw.split(",").filter(Boolean) : null,
    is_active: true,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/promo-codes");
  return { success: true };
}

export async function updatePromoCode(formData: FormData) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const id = formData.get("id") as string;
  const code = (formData.get("code") as string).toUpperCase().trim();
  const packageIdsRaw = formData.get("package_ids") as string;
  const maxUsesRaw = formData.get("max_uses") as string;
  const expiryRaw = formData.get("expiry_date") as string;

  const { error } = await supabase
    .from("promo_codes")
    .update({
      code,
      discount_type: formData.get("discount_type") as string,
      discount_value: Number(formData.get("discount_value")),
      expiry_date: expiryRaw || null,
      max_uses: maxUsesRaw ? Number(maxUsesRaw) : null,
      per_player_limit: Number(formData.get("per_player_limit")) || 1,
      package_ids: packageIdsRaw ? packageIdsRaw.split(",").filter(Boolean) : null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/promo-codes");
  return { success: true };
}

export async function togglePromoCodeStatus(id: string, isActive: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { error } = await supabase
    .from("promo_codes")
    .update({ is_active: !isActive })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/promo-codes");
  return { success: true };
}

export async function deletePromoCode(id: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Check if promo code has been used
  const { count } = await supabase
    .from("promo_code_uses")
    .select("*", { count: "exact", head: true })
    .eq("promo_code_id", id);

  if (count && count > 0) {
    return { error: "Cannot delete a promo code that has been used. Deactivate it instead." };
  }

  const { error } = await supabase.from("promo_codes").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/promo-codes");
  return { success: true };
}

export async function validatePromoCode(code: string, packageId: string, playerId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const trimmedCode = code.toUpperCase().trim();
  if (!trimmedCode) return { valid: false, error: "Please enter a promo code" };

  // Fetch the promo code
  const { data: promo } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("is_active", true)
    .ilike("code", trimmedCode)
    .single();

  if (!promo) return { valid: false, error: "Invalid promo code" };

  // Check expiry
  if (promo.expiry_date) {
    const today = new Date().toISOString().split("T")[0];
    if (promo.expiry_date < today) {
      return { valid: false, error: "This promo code has expired" };
    }
  }

  // Check max uses
  if (promo.max_uses !== null) {
    const { count: totalUses } = await supabase
      .from("promo_code_uses")
      .select("*", { count: "exact", head: true })
      .eq("promo_code_id", promo.id);

    if ((totalUses || 0) >= promo.max_uses) {
      return { valid: false, error: "This promo code has reached its usage limit" };
    }
  }

  // Check per-player limit
  if (promo.per_player_limit) {
    const { count: playerUses } = await supabase
      .from("promo_code_uses")
      .select("*", { count: "exact", head: true })
      .eq("promo_code_id", promo.id)
      .eq("player_id", playerId);

    if ((playerUses || 0) >= promo.per_player_limit) {
      return { valid: false, error: "You have already used this promo code" };
    }
  }

  // Check package restriction
  if (promo.package_ids && promo.package_ids.length > 0) {
    if (!promo.package_ids.includes(packageId)) {
      return { valid: false, error: "This promo code is not valid for the selected package" };
    }
  }

  return {
    valid: true,
    discount_type: promo.discount_type as string,
    discount_value: Number(promo.discount_value),
    promo_code_id: promo.id as string,
  };
}
