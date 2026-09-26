"use client";

import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { merchTypeLabel, type MerchItemView } from "@/lib/config/merch";
import { stockStatus, stockSummary, type StockStatus } from "@/lib/merch/stock";
import { MerchThumb, MerchPrice } from "@/components/merch/merch-shared";

const CHIP: Record<StockStatus, string> = {
  ok: "bg-slate-50 border-slate-200 text-slate-500 [&>b]:text-slate-900",
  low: "bg-amber-50 border-amber-200 text-amber-700 [&>b]:text-amber-700",
  out: "bg-red-50 border-red-200 text-red-600 [&>b]:text-red-600",
};

const ACTION =
  "text-xs font-semibold px-2.5 py-1 rounded-lg border border-primary-100 text-primary bg-white hover:bg-primary-50 transition-colors disabled:opacity-40 disabled:hover:bg-white";

export function ProductCard({
  item,
  pending,
  onEdit,
  onStock,
  onSell,
  onToggleVisibility,
}: {
  item: MerchItemView;
  pending: boolean;
  onEdit: () => void;
  onStock: () => void;
  onSell: () => void;
  onToggleVisibility: () => void;
}) {
  const summary = stockSummary(item.stock);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
      <MerchThumb
        url={item.image_url}
        alt={item.name}
        className={cn((summary.soldOut || !item.is_active) && "[&>img]:grayscale [&>img]:opacity-60")}
      >
        {summary.soldOut && (
          <Badge variant="danger" className="absolute top-2 left-2">
            Sold out
          </Badge>
        )}
        {!item.is_active && (
          <Badge variant="neutral" className="absolute top-2 right-2">
            Hidden
          </Badge>
        )}
      </MerchThumb>

      <div className="p-3 sm:p-4 flex flex-col gap-2.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm leading-snug">{item.name}</h3>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary mt-0.5">
              {merchTypeLabel(item.category_name, item.subcategory_name)}
            </p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="text-slate-400 hover:text-slate-600 p-1 shrink-0"
            title="Edit"
            aria-label={`Edit ${item.name}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        <MerchPrice price={item.price} className="text-base sm:text-lg" />

        <div className="flex flex-wrap gap-1.5">
          {item.stock.map((s) => (
            <button
              key={s.size}
              type="button"
              onClick={onStock}
              title="Update stock"
              aria-label={`${s.size}: ${s.quantity} in stock. Update stock`}
              className={cn(
                "inline-flex items-baseline gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors hover:border-primary-300",
                CHIP[stockStatus(s.quantity)],
              )}
            >
              {s.size}
              <b className="text-xs font-bold">{s.quantity}</b>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={item.is_active}
            aria-label={`Show ${item.name} to players`}
            onClick={onToggleVisibility}
            disabled={pending}
            className="flex items-center gap-2 text-xs text-slate-500 disabled:opacity-50"
          >
            <span
              className={cn(
                "relative w-8 h-[18px] rounded-full transition-colors shrink-0",
                item.is_active ? "bg-emerald-500" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all",
                  item.is_active ? "left-4" : "left-0.5",
                )}
              />
            </span>
            {item.is_active ? "Visible" : "Hidden"}
          </button>
          <div className="flex gap-1.5">
            <button type="button" onClick={onStock} className={ACTION}>
              Stock
            </button>
            <button
              type="button"
              onClick={onSell}
              disabled={summary.soldOut}
              title={summary.soldOut ? "Nothing in stock to sell" : undefined}
              className={ACTION}
            >
              Sell
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
