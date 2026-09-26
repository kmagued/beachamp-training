"use client";

import { useState } from "react";
import { Card, Badge, Drawer } from "@/components/ui";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { merchTypeLabel, type MerchCatalogItem } from "@/lib/config/merch";
import { MerchThumb, MerchSizes, MerchPrice, MerchCategoryChips, countByCategory } from "@/components/merch/merch-shared";

export function MerchCatalogClient({
  items,
  categories,
}: {
  items: MerchCatalogItem[];
  categories: { id: string; name: string }[];
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<MerchCatalogItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filtered = filter === "all" ? items : items.filter((i) => i.category_id === filter);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Academy Merch</h1>
        <p className="text-slate-500 text-sm">Official Beachamp gear for training and match days</p>
      </div>

      <div className="flex items-start gap-3 bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 mb-5 text-sm text-primary-700">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          <span className="font-semibold text-primary-900">Want something?</span> Merch is sold at the academy. Ask your
          coach at your next session and pay when you pick it up.
        </p>
      </div>

      {items.length === 0 ? (
        <Card className="text-center py-10">
          <p className="text-sm text-slate-500">No merch available yet. Check back soon.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4">
            <MerchCategoryChips categories={categories} counts={countByCategory(items)} value={filter} onChange={setFilter} />
          </div>

          {filtered.length === 0 ? (
            <Card className="text-center py-10">
              <p className="text-sm text-slate-500">Nothing in this category yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelected(item);
                    setDetailOpen(true);
                  }}
                  className="text-left bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10"
                >
                  <MerchThumb
                    url={item.image_url}
                    alt={item.name}
                    className={cn(item.is_sold_out && "[&>img]:grayscale [&>img]:opacity-60")}
                  >
                    {item.is_sold_out && (
                      <Badge variant="danger" className="absolute top-2 left-2">
                        Sold out
                      </Badge>
                    )}
                  </MerchThumb>
                  <div className="p-3 sm:p-4 flex flex-col gap-2 flex-1">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm leading-snug">{item.name}</h3>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary mt-0.5">
                        {merchTypeLabel(item.category_name, item.subcategory_name)}
                      </p>
                    </div>
                    <MerchPrice price={item.price} className="text-base sm:text-xl" />
                    <MerchSizes sizes={item.sizes} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Drawer open={detailOpen} onClose={() => setDetailOpen(false)} title={selected?.name}>
        {selected && (
          <div className="space-y-4">
            <MerchThumb
              url={selected.image_url}
              alt={selected.name}
              sizes="(max-width: 640px) 100vw, 448px"
              className="rounded-xl aspect-square"
            >
              {selected.is_sold_out && (
                <Badge variant="danger" className="absolute top-3 left-3">
                  Sold out
                </Badge>
              )}
            </MerchThumb>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary">
                {merchTypeLabel(selected.category_name, selected.subcategory_name)}
              </p>
              <MerchPrice price={selected.price} className="text-2xl mt-1" />
            </div>
            {selected.description && (
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{selected.description}</p>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Sizes</p>
              <MerchSizes sizes={selected.sizes} />
            </div>
            <div className="bg-sand rounded-lg px-4 py-3 text-sm text-primary-900">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-0.5">
                {selected.is_sold_out ? "Currently sold out" : "How to get it"}
              </p>
              {selected.is_sold_out
                ? "Ask your coach to let you know when it's back in stock."
                : "Ask your coach at your next session. You pay when you pick it up."}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
