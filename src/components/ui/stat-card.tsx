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

export function StatCard({ label, value, subtitle, accentColor = "bg-primary-800", icon, className, href }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center gap-3 sm:gap-4">
        {icon && (
          <div
            className={cn(
              "shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-white",
              accentColor
            )}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-primary-700/60 uppercase tracking-wider truncate">
            {label}
          </p>
          <p className="text-sm sm:text-xl font-bold text-primary-900 mt-0.5 capitalize truncate">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-primary-700/50 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {href && (
          <ChevronRight className="w-4 h-4 text-primary-700/30 shrink-0" />
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "group block bg-white rounded-2xl border border-primary-100 p-4 sm:p-5 hover:border-primary-300 hover:shadow-md hover:shadow-primary-900/5 transition-all",
          className
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-primary-100 p-4 sm:p-5",
        className
      )}
    >
      {content}
    </div>
  );
}
