"use client";

import { DollarSign } from "lucide-react";

export function RevenueCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="h-full bg-white rounded-2xl border border-primary-100 p-4 sm:p-5">
      <div className="flex items-center gap-3 sm:gap-4 h-full">
        <div className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white bg-emerald-500">
          <DollarSign className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-primary-700/60 uppercase tracking-wider truncate">
            {label}
          </p>
          <p className="text-sm sm:text-xl font-bold text-primary-900 mt-0.5 truncate">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-primary-700/50 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
