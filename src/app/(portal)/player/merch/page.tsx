import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { MERCH_CATALOG_SELECT, sortCategories, type MerchCategory } from "@/lib/config/merch";
import { availabilityByItem, toMerchCatalogItem, type MerchItemRow } from "@/lib/merch/views";
import { MerchCatalogClient } from "./_components/merch-catalog-client";

export default async function PlayerMerchPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Players can't read stock counts; merch_available_sizes() only says which sizes are in stock
  const [{ data: rows }, { data: categoryRows }, { data: availabilityRows }] = await Promise.all([
    supabase
      .from("merch_items")
      .select(MERCH_CATALOG_SELECT)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("merch_categories").select("id, name, sort_order, created_at"),
    supabase.rpc("merch_available_sizes"),
  ]);

  const publicUrl = (path: string) =>
    supabase.storage.from("merch-images").getPublicUrl(path).data.publicUrl as string;

  const availability = availabilityByItem(availabilityRows || []);
  const items = ((rows || []) as MerchItemRow[]).map((r) => toMerchCatalogItem(r, availability, publicUrl));

  // Only categories that have something to show
  const withItems = new Set(items.map((i) => i.category_id));
  const categories = sortCategories((categoryRows || []) as MerchCategory[])
    .filter((c) => withItems.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  return <MerchCatalogClient items={items} categories={categories} />;
}
