import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { MERCH_ITEM_SELECT, sortCategories, type MerchCategory, type MerchSubcategory } from "@/lib/config/merch";
import { toMerchItemView, type MerchItemRow } from "@/lib/merch/views";
import { ProductsClient } from "./_components/products-client";

export default async function AdminMerchProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ restock?: string }>;
}) {
  const { restock } = await searchParams;
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const [{ data: rows }, { data: categoryRows }, { data: subRows }] = await Promise.all([
    supabase
      .from("merch_items")
      .select(MERCH_ITEM_SELECT)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("merch_categories").select("id, name, sort_order, created_at"),
    supabase.from("merch_subcategories").select("id, category_id, name").order("name", { ascending: true }),
  ]);

  const publicUrl = (path: string) =>
    supabase.storage.from("merch-images").getPublicUrl(path).data.publicUrl as string;

  return (
    <ProductsClient
      items={((rows || []) as MerchItemRow[]).map((r) => toMerchItemView(r, publicUrl))}
      categories={sortCategories((categoryRows || []) as MerchCategory[])}
      subcategories={(subRows || []) as MerchSubcategory[]}
      restockId={restock ?? null}
    />
  );
}
