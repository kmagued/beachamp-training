// Shared by the merch server actions (products, stock, sales, categories). Server-side only.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function assertAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", supabase: null, userId: null } as const;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || me.role !== "admin") return { error: "Not authorized", supabase: null, userId: null } as const;
  return { error: null, supabase, userId: user.id as string } as const;
}

/** Everything that shows merch products, stock, categories or sales */
export function revalidateMerch() {
  revalidatePath("/admin/merch");
  revalidatePath("/admin/merch/categories");
  revalidatePath("/admin/merch/analytics");
  revalidatePath("/admin/finances");
  revalidatePath("/player/merch");
}
