import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accentColor?: string;
  icon?: ReactNode;
  className?: string;
  href?: string;
}

export function StatCard({ label, value, subtitle, accentColor = "bg-primary", icon, className, href }: StatCardProps) {
  const content = (
    <>
      <div className={cn("absolute top-0 left-0 right-0 h-[3px]", accentColor)} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-base sm:text-lg font-bold text-slate-900 mt-1 capitalize">{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 text-slate-300">
          {icon}
          {href && <ChevronRight className="w-4 h-4" />}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn("block bg-white rounded-xl border border-slate-200 p-5 relative overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all", className)}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn("bg-white rounded-xl border border-slate-200 p-5 relative overflow-hidden", className)}>
      {content}
    </div>
  );
}
