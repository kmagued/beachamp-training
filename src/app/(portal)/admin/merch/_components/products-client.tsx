"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boxes, CircleX, Package, Plus, Search, Shirt, ShoppingBag, TriangleAlert } from "lucide-react";
import { Button, Card, EmptyState, Input, Select, StatCard, Toast } from "@/components/ui";
import type { MerchCategory, MerchItemView, MerchSubcategory } from "@/lib/config/merch";
import { filterProducts, productStats, type StockFilter } from "@/lib/merch/products";
import { MerchCategoryChips, countByCategory } from "@/components/merch/merch-shared";
import { toggleMerchVisibility } from "../actions";
import { ProductCard } from "./product-card";
import { ProductDrawer, type ProductDrawerMode } from "./product-drawer";

type DrawerState = { mode: ProductDrawerMode; item: MerchItemView | null; key: number };

export function ProductsClient({
  items,
  categories,
  subcategories,
}: {
  items: MerchItemView[];
  categories: MerchCategory[];
  subcategories: MerchSubcategory[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [stock, setStock] = useState<StockFilter>("all");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const stats = useMemo(() => productStats(items), [items]);
  const filtered = useMemo(() => filterProducts(items, { search, categoryId, stock }), [items, search, categoryId, stock]);
  const counts = useMemo(() => countByCategory(items), [items]);
  const filtering = search.trim() !== "" || categoryId !== "all" || stock !== "all";

  function openDrawer(mode: ProductDrawerMode, item: MerchItemView | null) {
    // A fresh key remounts the drawer so its form starts from this product
    setDrawer((prev) => ({ mode, item, key: (prev?.key ?? 0) + 1 }));
    setDrawerOpen(true);
  }

  function handleSaved(message: string, keepOpen: boolean) {
    setToast({ message, variant: "success" });
    if (!keepOpen) setDrawerOpen(false);
    router.refresh();
  }

  function handleToggle(item: MerchItemView) {
    startTransition(async () => {
      const res = await toggleMerchVisibility(item.id, item.is_active);
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        return;
      }
      setToast({ message: item.is_active ? "Hidden from players" : "Now visible to players", variant: "success" });
      router.refresh();
    });
  }

  // Wired up by the stock and sale drawers
  const openStock = (item: MerchItemView) => void item;
  const openSale = (item: MerchItemView | null) => void item;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Products</h1>
          <p className="text-slate-500 text-sm">Your merch catalog, stock and what players can see</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="px-4" onClick={() => openSale(null)} disabled={items.length === 0}>
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4" />
              Record sale
            </span>
          </Button>
          <Button size="sm" className="px-4" onClick={() => openDrawer("create", null)}>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              New product
            </span>
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Shirt className="w-10 h-10" />}
            title="No products yet"
            description="Add your first product with its sizes and stock. It shows up in the player portal once it's visible."
            action={
              <Button size="sm" onClick={() => openDrawer("create", null)}>
                New product
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard
              label="Products"
              value={stats.products}
              subtitle={`${stats.visible} visible to players`}
              icon={<Package />}
            />
            <StatCard label="Units in stock" value={stats.units} subtitle="across all sizes" icon={<Boxes />} />
            <StatCard
              label="Low stock"
              value={stats.lowSizes}
              subtitle="sizes at 2 or fewer"
              icon={<TriangleAlert />}
              accentColor="bg-amber-500"
            />
            <StatCard
              label="Sold out"
              value={stats.outSizes}
              subtitle="sizes at 0"
              icon={<CircleX />}
              accentColor="bg-red-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="pl-9"
                aria-label="Search products"
              />
            </div>
            <MerchCategoryChips categories={categories} counts={counts} value={categoryId} onChange={setCategoryId} />
            <div className="w-44">
              <Select value={stock} onChange={(e) => setStock(e.target.value as StockFilter)} aria-label="Stock filter">
                <option value="all">All stock</option>
                <option value="attention">Low or out</option>
                <option value="hidden">Hidden from players</option>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <Card className="text-center py-10">
              <p className="text-sm text-slate-500 mb-3">No products match these filters.</p>
              {filtering && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setCategoryId("all");
                    setStock("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filtered.map((item) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  pending={isPending}
                  onEdit={() => openDrawer("edit", item)}
                  onStock={() => openStock(item)}
                  onSell={() => openSale(item)}
                  onToggleVisibility={() => handleToggle(item)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {drawer && (
        <ProductDrawer
          key={drawer.key}
          open={drawerOpen}
          mode={drawer.mode}
          item={drawer.item}
          categories={categories}
          subcategories={subcategories}
          onClose={() => setDrawerOpen(false)}
          onSaved={handleSaved}
          onUpdateStock={(item) => {
            setDrawerOpen(false);
            openStock(item);
          }}
          onDuplicate={(item) => openDrawer("duplicate", item)}
        />
      )}
    </div>
  );
}
