import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import type { MerchItem } from "@/types/database";
import { toMerchView, MERCH_ITEM_SELECT, type MerchSubcategory } from "@/lib/config/merch";
import { MerchAdminClient } from "./_components/merch-admin-client";

export default async function AdminMerchPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: rows } = await supabase
    .from("merch_items")
    .select(MERCH_ITEM_SELECT)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: subRows } = await supabase
    .from("merch_subcategories")
    .select("id, category, name")
    .order("name", { ascending: true });

  const publicUrl = (path: string) =>
    supabase.storage.from("merch-images").getPublicUrl(path).data.publicUrl as string;

  const items = ((rows || []) as MerchItem[]).map((r) => toMerchView(r, publicUrl));

  return <MerchAdminClient items={items} subcategories={(subRows || []) as MerchSubcategory[]} />;
}
