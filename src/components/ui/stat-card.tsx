import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor?: string;
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, subtitle, accentColor = "bg-primary", icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200 p-5 relative overflow-hidden",
        className
      )}
    >
      <div className={cn("absolute top-0 left-0 right-0 h-[3px]", accentColor)} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="text-slate-300">{icon}</div>
        )}
      </div>
    </div>
  );
}
