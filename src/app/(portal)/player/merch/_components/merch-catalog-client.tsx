"use client";

import { useState } from "react";
import type { MerchCatalogItem } from "@/lib/config/merch";
import { CATALOG_TONES, categoryTone, placeholderWord } from "@/lib/merch/catalog";
import { MerchCategoryChips, MerchSizes, countByCategory } from "@/components/merch/merch-shared";
import { CatalogHero } from "./catalog-hero";
import { CatalogEmpty } from "./catalog-empty";
import { ProductArt } from "./product-art";
import { ProductSheet } from "./product-sheet";

export function MerchCatalogClient({
  items,
  categories,
}: {
  items: MerchCatalogItem[];
  /** Every category, in display order; created_at picks each one's tile colour */
  categories: { id: string; name: string; created_at: string }[];
}) {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<MerchCatalogItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Only categories with something in them get a filter, so a filter never comes up empty
  const withItems = categories.filter((c) => items.some((i) => i.category_id === c.id));
  const shown = filter === "all" ? items : items.filter((i) => i.category_id === filter);
  const toneOf = (categoryId: string) => categoryTone(categoryId, categories);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <CatalogHero
        subtitle={
          items.length
            ? "Hoodies, tees and gear from the academy. Ask your coach, then pay when you pick it up."
            : "Hoodies, tees and gear from the academy."
        }
      />

      {items.length === 0 ? (
        <CatalogEmpty />
      ) : (
        <>
          {withItems.length > 1 && (
            <div className="mt-5">
              <MerchCategoryChips
                categories={withItems}
                counts={countByCategory(items)}
                value={filter}
                onChange={setFilter}
              />
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
            {shown.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelected(item);
                  setSheetOpen(true);
                }}
                className="group flex flex-col text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
              >
                <ProductArt
                  imageUrl={item.image_url}
                  alt={item.name}
                  word={placeholderWord(item.subcategory_name, item.category_name)}
                  tone={toneOf(item.category_id)}
                  soldOut={item.is_sold_out}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="transition-transform duration-200 group-hover:scale-[1.015]"
                />
                <p className="mt-2.5 text-sm font-semibold leading-snug text-slate-900">{item.name}</p>
                <p className="mt-0.5 text-sm font-extrabold text-primary">
                  {item.price.toLocaleString("en-US")} <span className="text-[11px] font-semibold text-slate-400">EGP</span>
                </p>
                {item.sizes.length > 0 && (
                  <div className="mt-2">
                    <MerchSizes sizes={item.sizes} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <ProductSheet
        item={selected}
        tone={selected ? toneOf(selected.category_id) : CATALOG_TONES[0]}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
