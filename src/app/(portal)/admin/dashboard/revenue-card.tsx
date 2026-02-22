"use client";

import { DollarSign } from "lucide-react";

export function RevenueCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-500" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-1 whitespace-nowrap">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        <div className="text-slate-300">
          <DollarSign className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
