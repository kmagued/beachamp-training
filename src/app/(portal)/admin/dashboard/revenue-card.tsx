"use client";

import { useState } from "react";
import { DollarSign, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function RevenueCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-emerald-500" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <div className="flex items-center gap-2 mt-1">
            <p className={cn(
              "text-base sm:text-lg lg:text-2xl font-bold text-slate-900 transition-all duration-200 select-none whitespace-nowrap",
              !visible && "blur-md"
            )}>
              {value}
            </p>
            <button
              onClick={() => setVisible((v) => !v)}
              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
              aria-label={visible ? "Hide revenue" : "Show revenue"}
            >
              {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {subtitle && (
            <p className={cn(
              "text-xs text-slate-400 mt-1 transition-all duration-200 select-none",
              !visible && "blur-md"
            )}>
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
