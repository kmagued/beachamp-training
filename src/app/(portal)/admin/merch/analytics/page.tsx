import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { cairoToday } from "@/lib/utils/cairo-time";
import type { AnalyticsCategory, AnalyticsSubcategory, CatalogItem, SaleRow, StockRow } from "@/lib/merch/analytics";
import { AnalyticsClient } from "./_components/analytics-client";

/** PostgREST returns at most this many rows per request */
const PAGE = 1000;

export default async function AdminMerchAnalyticsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // Every merch sale: income linked to a product, plus Merch income entered without one
  const { data: merchCategories } = await supabase.from("income_categories").select("id").eq("is_merch", true);
  const merchCategoryIds = ((merchCategories || []) as { id: string }[]).map((c) => c.id);

  const sales: SaleRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("income")
      .select("id, income_date, amount, merch_item_id, merch_size, merch_quantity")
      .eq("is_active", true);
    query = merchCategoryIds.length
      ? query.or(`merch_item_id.not.is.null,category_id.in.(${merchCategoryIds.join(",")})`)
      : query.not("merch_item_id", "is", null);
    const { data, error } = await query
      .order("income_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data as {
      id: string;
      income_date: string;
      amount: number | string;
      merch_item_id: string | null;
      merch_size: string | null;
      merch_quantity: number | null;
    }[]) {
      sales.push({
        id: r.id,
        date: r.income_date,
        amount: Number(r.amount),
        itemId: r.merch_item_id,
        size: r.merch_size,
        quantity: r.merch_quantity,
      });
    }
    if (data.length < PAGE) break;
  }

  const [{ data: itemRows }, { data: categoryRows }, { data: subRows }, { data: stockRows }] = await Promise.all([
    // Deleted products too: their past sales still count
    supabase.from("merch_items").select("id, name, price, category_id, subcategory_id, is_active, deleted_at"),
    supabase.from("merch_categories").select("id, name, sort_order, created_at"),
    supabase.from("merch_subcategories").select("id, name, category_id"),
    supabase.from("merch_stock").select("item_id, size, quantity"),
  ]);

  const items: CatalogItem[] = (
    (itemRows || []) as {
      id: string;
      name: string;
      price: number | string;
      category_id: string;
      subcategory_id: string | null;
      is_active: boolean;
      deleted_at: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    categoryId: r.category_id,
    subcategoryId: r.subcategory_id,
    isActive: r.is_active,
    deleted: !!r.deleted_at,
  }));

  const categories: AnalyticsCategory[] = (
    (categoryRows || []) as { id: string; name: string; sort_order: number; created_at: string }[]
  ).map((c) => ({ id: c.id, name: c.name, sortOrder: c.sort_order, createdAt: c.created_at }));

  const subcategories: AnalyticsSubcategory[] = ((subRows || []) as { id: string; name: string; category_id: string }[]).map(
    (s) => ({ id: s.id, name: s.name, categoryId: s.category_id }),
  );

  const stock: StockRow[] = ((stockRows || []) as { item_id: string; size: string; quantity: number }[]).map((s) => ({
    itemId: s.item_id,
    size: s.size,
    quantity: s.quantity,
  }));

  return (
    <AnalyticsClient
      sales={sales}
      items={items}
      categories={categories}
      subcategories={subcategories}
      stock={stock}
      today={cairoToday()}
    />
  );
}
