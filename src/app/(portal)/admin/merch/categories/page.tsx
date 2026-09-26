import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { sortCategories, type MerchCategory, type MerchSubcategory } from "@/lib/config/merch";
import { CategoriesClient, type CategoryCard } from "./_components/categories-client";

export default async function AdminMerchCategoriesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const [{ data: categoryRows }, { data: subRows }, { data: itemRows }] = await Promise.all([
    supabase.from("merch_categories").select("id, name, sort_order, created_at"),
    supabase.from("merch_subcategories").select("id, category_id, name").order("name", { ascending: true }),
    // Deleted products count too: they keep their category and sub-category for past sales
    supabase.from("merch_items").select("category_id, subcategory_id, deleted_at"),
  ]);

  const items = (itemRows || []) as { category_id: string; subcategory_id: string | null; deleted_at: string | null }[];
  const subcategories = (subRows || []) as MerchSubcategory[];

  const cards: CategoryCard[] = sortCategories((categoryRows || []) as MerchCategory[]).map((c) => {
    const inCategory = items.filter((i) => i.category_id === c.id);
    return {
      ...c,
      products: inCategory.filter((i) => !i.deleted_at).length,
      items: inCategory.length,
      subcategories: subcategories
        .filter((s) => s.category_id === c.id)
        .map((s) => {
          const using = inCategory.filter((i) => i.subcategory_id === s.id);
          return {
            id: s.id,
            name: s.name,
            live: using.filter((i) => !i.deleted_at).length,
            deleted: using.filter((i) => i.deleted_at).length,
          };
        }),
    };
  });

  return <CategoriesClient categories={cards} />;
}
