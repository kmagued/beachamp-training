import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import type { MerchItem } from "@/types/database";
import { toMerchView, MERCH_ITEM_SELECT } from "@/lib/config/merch";
import { MerchCatalogClient } from "./_components/merch-catalog-client";

export default async function PlayerMerchPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: rows } = await supabase
    .from("merch_items")
    .select(MERCH_ITEM_SELECT)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const publicUrl = (path: string) =>
    supabase.storage.from("merch-images").getPublicUrl(path).data.publicUrl as string;

  const items = ((rows || []) as MerchItem[]).map((r) => toMerchView(r, publicUrl));

  return <MerchCatalogClient items={items} />;
}
