"use client";

import { useState, useTransition } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button, Drawer } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { MerchItemView, MerchStockLevel } from "@/lib/config/merch";
import {
  changedSizes,
  isStockRefusal,
  mergeRecountInput,
  parseCount,
  recountChanges,
  restockTotal,
  sortSizes,
} from "@/lib/merch/stock";
import { recountMerch, restockMerch } from "../actions";

type Tab = "restock" | "recount";

const TH = "text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 pb-2";
const TD = "px-2 py-1.5 border-t border-slate-100 text-sm";
const INPUT =
  "w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary aria-[invalid=true]:border-red-400";

/** Restock adds what arrived; Recount sets what's on the shelf. Both go through the database
 *  functions so a sale recorded at the same moment is never overwritten. */
export function StockDrawer({
  item,
  open,
  onClose,
  onSaved,
  onStale,
}: {
  item: MerchItemView;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  /** A size was removed meanwhile; refresh what the page shows */
  onStale: () => void;
}) {
  const [tab, setTab] = useState<Tab>("restock");
  const [baseline, setBaseline] = useState<MerchStockLevel[]>(item.stock);
  const [arrived, setArrived] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(item.stock.map((s) => [s.size, String(s.quantity)])),
  );
  const [moved, setMoved] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Restock: a blank box means nothing arrived
  const arrivedCounts = Object.fromEntries(
    baseline.map((s) => [s.size, (arrived[s.size] ?? "").trim() === "" ? 0 : parseCount(arrived[s.size])]),
  );
  const restockInvalid = Object.values(arrivedCounts).some((n) => n === null);
  const addedTotal = restockInvalid ? 0 : restockTotal(arrivedCounts as Record<string, number>);

  // Recount: every box needs a count
  const countedValues = Object.fromEntries(baseline.map((s) => [s.size, parseCount(counted[s.size] ?? "")]));
  const recountInvalid = Object.values(countedValues).some((n) => n === null);
  const changes = recountInvalid ? [] : recountChanges(baseline, countedValues as Record<string, number>);

  function saveRestock() {
    setError(null);
    const added = Object.fromEntries(
      Object.entries(arrivedCounts).filter((entry): entry is [string, number] => (entry[1] ?? 0) > 0),
    );
    startTransition(async () => {
      const res = await restockMerch(item.id, added);
      if ("error" in res) {
        setError(res.error);
        if (isStockRefusal(res.code)) onStale();
        return;
      }
      onSaved(`Added ${addedTotal} to ${item.name}`);
    });
  }

  function saveRecount() {
    setError(null);
    startTransition(async () => {
      const res = await recountMerch(item.id, changes);
      if ("error" in res) {
        setError(res.error);
        if (isStockRefusal(res.code)) onStale();
        return;
      }
      if (!res.ok) {
        const latest = sortSizes(Object.entries(res.stock).map(([size, quantity]) => ({ size, quantity })));
        setMoved(changedSizes(baseline, res.stock));
        setCounted((typed) => mergeRecountInput(baseline, typed, latest));
        setBaseline(latest);
        return;
      }
      onSaved(`Counts saved for ${item.name}`);
    });
  }

  const tabButton = (value: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => {
        setTab(value);
        setError(null);
      }}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
        tab === value ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700",
      )}
    >
      {label}
    </button>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Update stock"
      footer={
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm text-slate-500">
            {tab === "restock" ? (
              <>
                <b className="text-emerald-600">+{addedTotal}</b> {addedTotal === 1 ? "unit" : "units"}
              </>
            ) : (
              `${changes.length} ${changes.length === 1 ? "size" : "sizes"} changed`
            )}
          </p>
          <Button variant="secondary" className="px-4" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            className="px-4"
            onClick={tab === "restock" ? saveRestock : saveRecount}
            disabled={
              isPending ||
              (tab === "restock" ? restockInvalid || addedTotal === 0 : recountInvalid || changes.length === 0)
            }
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </span>
            ) : tab === "restock" ? (
              "Add to stock"
            ) : (
              "Save counts"
            )}
          </Button>
        </div>
      }
    >
      <p className="text-sm font-semibold text-slate-700 mb-3">{item.name}</p>

      <div role="tablist" aria-label="Stock change" className="flex gap-1 rounded-lg bg-slate-100 p-1 mb-3">
        {tabButton("restock", "Restock")}
        {tabButton("recount", "Recount")}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        {tab === "restock"
          ? "Enter how many arrived. They're added to what's in stock."
          : "Enter what's actually on the shelf. It replaces the current count."}
      </p>

      {tab === "recount" && moved.length > 0 && (
        <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3 text-sm text-amber-800">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Stock changed while you were counting (a sale was recorded). The highlighted sizes show the new count. Check
            your counts and save again.
          </p>
        </div>
      )}

      {baseline.length === 0 ? (
        <p className="text-sm text-slate-500">This product has no sizes yet. Add them from Edit.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Size</th>
              <th className={cn(TH, "text-right")}>In stock</th>
              <th className={cn(TH, "text-right")}>{tab === "restock" ? "Arrived" : "Counted"}</th>
              <th className={cn(TH, "text-right")}>{tab === "restock" ? "After" : "Change"}</th>
            </tr>
          </thead>
          <tbody>
            {baseline.map((s) => {
              if (tab === "restock") {
                const n = arrivedCounts[s.size];
                return (
                  <tr key={s.size}>
                    <td className={cn(TD, "font-bold text-slate-700")}>{s.size}</td>
                    <td className={cn(TD, "text-right font-semibold text-slate-500")}>{s.quantity}</td>
                    <td className={cn(TD, "text-right")}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={arrived[s.size] ?? ""}
                        placeholder="0"
                        onChange={(e) => setArrived((prev) => ({ ...prev, [s.size]: e.target.value }))}
                        aria-label={`${s.size} arrived`}
                        aria-invalid={n === null}
                        className={INPUT}
                      />
                    </td>
                    <td
                      className={cn(
                        TD,
                        "text-right font-bold",
                        n && n > 0 ? "text-emerald-600" : "text-slate-900",
                      )}
                    >
                      {n === null ? "–" : s.quantity + n}
                    </td>
                  </tr>
                );
              }
              const c = countedValues[s.size];
              const diff = c === null ? null : c - s.quantity;
              return (
                <tr key={s.size} className={cn(moved.includes(s.size) && "bg-amber-50")}>
                  <td className={cn(TD, "font-bold text-slate-700")}>{s.size}</td>
                  <td className={cn(TD, "text-right font-semibold text-slate-500")}>{s.quantity}</td>
                  <td className={cn(TD, "text-right")}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={counted[s.size] ?? ""}
                      onChange={(e) => setCounted((prev) => ({ ...prev, [s.size]: e.target.value }))}
                      aria-label={`${s.size} counted`}
                      aria-invalid={c === null}
                      className={INPUT}
                    />
                  </td>
                  <td
                    className={cn(
                      TD,
                      "text-right font-bold",
                      diff && diff > 0 && "text-emerald-600",
                      diff && diff < 0 && "text-red-600",
                      !diff && "text-slate-300",
                    )}
                  >
                    {diff === null ? "–" : diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : "0"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {error && <div className="mt-3 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600">{error}</div>}
    </Drawer>
  );
}
