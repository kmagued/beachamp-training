"use client";

import { Drawer } from "@/components/ui";
import type { MerchCatalogItem } from "@/lib/config/merch";
import { placeholderWord, soldOutSizesNote, type CatalogTone } from "@/lib/merch/catalog";
import { MerchSizes } from "@/components/merch/merch-shared";
import { ProductArt } from "./product-art";

/** A product's details: a bottom sheet on phones, a side panel on larger screens */
export function ProductSheet({
  item,
  tone,
  open,
  onClose,
}: {
  item: MerchCatalogItem | null;
  tone: CatalogTone;
  open: boolean;
  onClose: () => void;
}) {
  const note = item ? soldOutSizesNote(item.sizes) : null;

  return (
    <Drawer open={open} onClose={onClose} title={item?.name}>
      {item && (
        <div className="space-y-5">
          <ProductArt
            imageUrl={item.image_url}
            alt={item.name}
            word={placeholderWord(item.subcategory_name, item.category_name)}
            tone={tone}
            soldOut={item.is_sold_out}
            sizes="(max-width: 640px) 100vw, 448px"
          />

          <div className="flex items-baseline justify-between gap-3">
            <p className="text-2xl font-extrabold text-primary-900">
              {item.price.toLocaleString("en-US")} <span className="text-sm font-semibold text-slate-400">EGP</span>
            </p>
            <p className="text-sm font-semibold text-slate-500">{item.subcategory_name ?? item.category_name}</p>
          </div>

          {item.description && (
            <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-line">{item.description}</p>
          )}

          {item.sizes.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">Sizes</p>
              <MerchSizes sizes={item.sizes} large />
              {note && <p className="mt-2 text-xs text-slate-400">{note}</p>}
            </div>
          )}

          <div className="relative overflow-hidden rounded-xl bg-sand px-4 py-3.5 text-sm text-primary-700">
            <span aria-hidden="true" className="absolute -right-6 -bottom-2 h-2.5 w-24 -rotate-[30deg] bg-secondary/50" />
            <p className="font-bold text-primary-900">{item.is_sold_out ? "Sold out right now" : "How to get it"}</p>
            <p className="mt-0.5">
              {item.is_sold_out
                ? "Ask your coach to let you know when it's back."
                : "Ask your coach at your next session. You pay when you pick it up."}
            </p>
          </div>
        </div>
      )}
    </Drawer>
  );
}
