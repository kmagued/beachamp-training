"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { colorFor, type ProductRow } from "@/lib/merch/analytics";
import { formatRange, formatShare } from "@/lib/merch/format";

type SortKey = "name" | "units" | "revenue" | "avgPrice" | "onHand" | "lastSold";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Product", numeric: false },
  { key: "units", label: "Units", numeric: true },
  { key: "revenue", label: "Revenue", numeric: true },
  { key: "revenue", label: "Share", numeric: true },
  { key: "avgPrice", label: "Avg price", numeric: true },
  { key: "onHand", label: "On hand", numeric: true },
  { key: "lastSold", label: "Last sold", numeric: true },
];

/** Missing values (no units, deleted stock) always sort last, whichever way */
function compare(a: ProductRow, b: ProductRow, key: SortKey, dir: 1 | -1) {
  const va = a[key];
  const vb = b[key];
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
  return ((va as number) - (vb as number)) * dir;
}

export function ProductTable({ rows, colors }: { rows: ProductRow[]; colors: Map<string, string> }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "revenue", dir: -1 });
  const sorted = [...rows].sort((a, b) => compare(a, b, sort.key, sort.dir) || a.name.localeCompare(b.name));

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 }));
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 min-w-0">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold text-slate-900">By product</h2>
        <p className="text-xs text-slate-400 mt-0.5">Click a column to sort · deleted products keep their sales</p>
      </div>
      {rows.length === 0 ? (
        <p className="pb-10 pt-6 text-center text-sm text-slate-400">No sales in this period</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr>
                {COLUMNS.map((c, i) => {
                  const active = sort.key === c.key && c.label !== "Share";
                  const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={`${c.label}-${i}`}
                      className={cn(
                        "px-4 py-2.5 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
                        c.numeric ? "text-right" : "text-left",
                      )}
                      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                    >
                      {c.label === "Share" ? (
                        <span className="text-slate-400">{c.label}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggle(c.key)}
                          className={cn(
                            "inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-600",
                            active ? "text-primary" : "text-slate-400",
                          )}
                        >
                          {c.label}
                          <Icon className={cn("w-3 h-3", !active && "opacity-40")} />
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(r.categoryId ?? r.key, colors) }} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 whitespace-nowrap">
                          {r.name}
                          {r.hidden && !r.deleted && (
                            <Badge variant="neutral" className="ml-1.5 align-middle">
                              Hidden
                            </Badge>
                          )}
                          {r.deleted && (
                            <Badge variant="neutral" className="ml-1.5 align-middle">
                              Deleted
                            </Badge>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400 whitespace-nowrap">
                          {r.categoryName
                            ? [r.categoryName, r.subcategoryName].filter(Boolean).join(" · ")
                            : `${r.entries} Merch income ${r.entries === 1 ? "entry" : "entries"}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{r.units ?? "–"}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-900">{r.revenue.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <span className="w-20 h-1.5 rounded-r bg-slate-100 overflow-hidden">
                        <span
                          className="block h-full rounded-r"
                          style={{ width: `${r.share * 100}%`, background: colorFor(r.categoryId ?? r.key, colors) }}
                        />
                      </span>
                      <span className="w-9 text-right text-xs text-slate-500">{formatShare(r.share)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">
                    {r.avgPrice == null ? "–" : Math.round(r.avgPrice).toLocaleString("en-US")}
                    {r.avgPrice != null && r.listPrice != null && Math.round(r.avgPrice) !== Math.round(r.listPrice) && (
                      <span className="block text-[10px] text-slate-400">list {r.listPrice.toLocaleString("en-US")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{r.onHand ?? "–"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">
                    {formatRange({ from: r.lastSold, to: r.lastSold })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
