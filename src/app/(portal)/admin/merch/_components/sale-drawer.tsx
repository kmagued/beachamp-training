"use client";

import { useState, useTransition } from "react";
import { Loader2, Minus, Plus, Search } from "lucide-react";
import { Badge, Button, DatePicker, Drawer, Input, Label } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { merchTypeLabel, type MerchItemView } from "@/lib/config/merch";
import { maxSellable, stockSummary } from "@/lib/merch/stock";
import { cairoToday } from "@/lib/utils/cairo-time";
import { MerchThumb } from "@/components/merch/merch-shared";
import { recordMerchSale } from "../actions";

/** The size to start on: the only one with stock left, if there is exactly one */
function onlySizeInStock(item: MerchItemView) {
  const inStock = item.stock.filter((s) => s.quantity > 0);
  return inStock.length === 1 ? inStock[0].size : "";
}

export function SaleDrawer({
  open,
  items,
  initialItemId,
  onClose,
  onSaved,
  onStale,
}: {
  open: boolean;
  /** Current products; the chosen one is read from here so refreshed counts show up */
  items: MerchItemView[];
  initialItemId: string | null;
  onClose: () => void;
  /** keepOpen: "Save & sell another" was used and the drawer is back at the product list */
  onSaved: (message: string, keepOpen: boolean) => void;
  /** The counts shown were out of date; refresh them */
  onStale: () => void;
}) {
  const initialItem = items.find((i) => i.id === initialItemId) ?? null;
  const [itemId, setItemId] = useState<string | null>(initialItem?.id ?? null);
  const [search, setSearch] = useState("");
  const [size, setSize] = useState(initialItem ? onlySizeInStock(initialItem) : "");
  const [quantity, setQuantity] = useState(1);
  const [amountAuto, setAmountAuto] = useState(true);
  const [amountTyped, setAmountTyped] = useState("");
  const [date, setDate] = useState(cairoToday());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const item = items.find((i) => i.id === itemId) ?? null;
  const max = item && size ? maxSellable(item.stock, size) : 0;
  const qty = Math.min(quantity, Math.max(max, 1));
  // Price × quantity until the admin types their own amount (a discount)
  const amount = amountAuto && item ? String(item.price * qty) : amountTyped;
  const inStockNow = item?.stock.find((s) => s.size === size)?.quantity ?? 0;

  const q = search.trim().toLowerCase();
  const pickable = items.filter(
    (i) => !q || i.name.toLowerCase().includes(q) || (i.subcategory_name ?? "").toLowerCase().includes(q),
  );

  function choose(next: MerchItemView) {
    setItemId(next.id);
    setSize(onlySizeInStock(next));
    setQuantity(1);
    setAmountAuto(true);
    setAmountTyped("");
    setError(null);
  }

  function backToList() {
    setItemId(null);
    setSize("");
    setQuantity(1);
    setAmountAuto(true);
    setAmountTyped("");
    setNote("");
    setError(null);
  }

  function submit(sellAnother: boolean) {
    if (!item) return;
    setError(null);
    const sold = { name: item.name, size, qty };
    startTransition(async () => {
      const res = await recordMerchSale({
        itemId: item.id,
        size,
        quantity: qty,
        amount: Number(amount),
        date,
        note,
      });
      if (!("success" in res)) {
        setError(res.error);
        if ("code" in res && (res.code === "MS001" || res.code === "MS002")) onStale();
        return;
      }
      const left = res.remaining != null ? ` · ${res.remaining} ${sold.size} left` : "";
      const message = `Sold ${sold.qty} × ${sold.size} ${sold.name}${left}`;
      if (sellAnother) {
        backToList();
        setSearch("");
        onSaved(message, true);
      } else {
        onSaved(message, false);
      }
    });
  }

  const canSubmit = !!item && !!size && max >= 1 && !isPending;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Record sale"
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="flex-1 px-3" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="outline" className="flex-1 px-3" onClick={() => submit(true)} disabled={!canSubmit}>
            Save &amp; sell another
          </Button>
          <Button className="flex-1 px-3" onClick={() => submit(false)} disabled={!canSubmit}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </span>
            ) : (
              `Record sale${amount && Number(amount) > 0 ? ` · ${Number(amount).toLocaleString("en-US")} EGP` : ""}`
            )}
          </Button>
        </div>
      }
    >
      {!item ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="pl-9"
              aria-label="Search products"
              autoFocus
            />
          </div>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {pickable.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">No products match.</p>
            ) : (
              pickable.map((p) => {
                const summary = stockSummary(p.stock);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choose(p)}
                    disabled={summary.soldOut || p.stock.length === 0}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 disabled:opacity-45 disabled:hover:bg-white"
                  >
                    <MerchThumb url={p.image_url} alt="" sizes="40px" className="w-10 aspect-square rounded-lg shrink-0 [&>svg]:w-5 [&>svg]:h-5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 truncate">
                        {p.name}
                        {!p.is_active && (
                          <Badge variant="neutral" className="ml-1.5 align-middle">
                            Hidden
                          </Badge>
                        )}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {merchTypeLabel(p.category_name, p.subcategory_name)}
                      </span>
                    </span>
                    <span className={cn("text-xs shrink-0", summary.soldOut ? "text-red-600 font-semibold" : "text-slate-500")}>
                      {summary.soldOut ? "Sold out" : `${summary.total} in stock`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Product</Label>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <MerchThumb url={item.image_url} alt="" sizes="40px" className="w-10 aspect-square rounded-lg shrink-0 [&>svg]:w-5 [&>svg]:h-5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                <p className="text-xs font-bold text-primary">{item.price.toLocaleString("en-US")} EGP</p>
              </div>
              <button type="button" onClick={backToList} className="text-xs font-semibold text-secondary-dark hover:underline">
                Change
              </button>
            </div>
          </div>

          <div>
            <Label required>Size</Label>
            <div className="flex flex-wrap gap-2">
              {item.stock.map((s) => {
                const none = s.quantity === 0;
                return (
                  <button
                    key={s.size}
                    type="button"
                    onClick={() => {
                      setSize(s.size);
                      setError(null);
                    }}
                    disabled={none}
                    aria-pressed={size === s.size}
                    className={cn(
                      "min-w-[62px] rounded-lg border px-2.5 py-1.5 text-sm font-bold flex flex-col items-center leading-tight transition-colors",
                      size === s.size
                        ? "bg-primary border-primary text-white"
                        : "bg-white border-slate-300 text-slate-700 hover:border-slate-400",
                      none && "border-dashed bg-slate-50 text-slate-300 line-through hover:border-slate-300",
                    )}
                  >
                    {s.size}
                    <span
                      className={cn(
                        "text-[10px] font-semibold no-underline",
                        size === s.size ? "text-primary-100" : none ? "text-red-400" : "text-slate-400",
                      )}
                    >
                      {none ? "none left" : `${s.quantity} left`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Quantity</Label>
              <div className="inline-flex items-center rounded-lg border border-slate-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  className="w-9 h-10 flex items-center justify-center bg-slate-50 text-slate-600 disabled:opacity-40"
                  aria-label="One fewer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 h-10 flex items-center justify-center border-x border-slate-200 bg-white font-bold text-slate-900">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(max, qty + 1))}
                  disabled={!size || qty >= max}
                  className="w-9 h-10 flex items-center justify-center bg-slate-50 text-slate-600 disabled:opacity-40"
                  aria-label="One more"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {size && <p className="text-xs text-slate-400 mt-1">Up to {max}</p>}
            </div>
            <div>
              <Label required>Amount (EGP)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => {
                  setAmountAuto(false);
                  setAmountTyped(e.target.value);
                }}
              />
              <p className="text-xs text-slate-400 mt-1">
                {item.price.toLocaleString("en-US")} × {qty} · edit for a discount
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label required>Date</Label>
              <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. buyer's name" />
            </div>
          </div>

          {size && max >= 1 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              After this sale: {size} stock {inStockNow} → {inStockNow - qty}
            </div>
          )}

          {error && <div className="px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}
        </div>
      )}
    </Drawer>
  );
}
