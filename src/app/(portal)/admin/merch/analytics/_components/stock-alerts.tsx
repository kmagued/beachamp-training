"use client";

import Link from "next/link";
import { CircleX, TriangleAlert } from "lucide-react";
import type { StockAlert } from "@/lib/merch/analytics";

/** Sizes that are out or low right now. Status is an icon plus a word, never colour alone. */
export function StockAlerts({ alerts, totals }: { alerts: StockAlert[]; totals: { units: number; value: number } }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-4 min-w-0">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-900">Stock alerts</h2>
        <p className="text-xs text-slate-400 mt-0.5">Right now · follows the category filters, not the dates</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700/60">Units on hand</p>
          <p className="text-base font-bold text-slate-900">{totals.units.toLocaleString("en-US")}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700/60">Stock value at price</p>
          <p className="text-base font-bold text-slate-900">
            {Math.round(totals.value).toLocaleString("en-US")} <span className="text-xs font-medium text-slate-400">EGP</span>
          </p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nothing is low or out right now</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="text-left font-bold px-1.5 pb-1.5">Status</th>
                  <th className="text-left font-bold px-1.5 pb-1.5">Product · size</th>
                  <th className="text-right font-bold px-1.5 pb-1.5">On hand</th>
                  <th className="text-right font-bold px-1.5 pb-1.5">Sold*</th>
                  <th className="px-1.5 pb-1.5" />
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={`${a.itemId}|${a.size}`} className="border-t border-slate-100">
                    <td className="px-1.5 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-bold text-slate-800">
                        {a.status === "out" ? (
                          <CircleX className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
                        ) : (
                          <TriangleAlert className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                        )}
                        {a.status === "out" ? "Out" : "Low"}
                      </span>
                    </td>
                    <td className="px-1.5 py-2 min-w-0">
                      <span className="font-semibold text-slate-800">{a.name}</span>{" "}
                      <span className="text-slate-400 font-semibold">· {a.size}</span>
                    </td>
                    <td className="px-1.5 py-2 text-right font-bold text-slate-900">{a.quantity}</td>
                    <td className="px-1.5 py-2 text-right text-slate-600">{a.sold}</td>
                    <td className="px-1.5 py-2 text-right">
                      <Link
                        href={`/admin/merch?restock=${a.itemId}`}
                        className="inline-block rounded-md border border-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary-50"
                      >
                        Restock
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">* sold in the selected period, so the most-wanted gaps come first.</p>
        </>
      )}
    </section>
  );
}
