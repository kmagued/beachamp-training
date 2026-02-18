import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, totalItems, onPageChange }: PaginationProps) {
  const effectiveTotal = Math.max(totalPages, 1);

  // Build page numbers to show (max 5 around current)
  const pages: (number | "...")[] = [];
  if (effectiveTotal <= 5) {
    for (let i = 1; i <= effectiveTotal; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(effectiveTotal - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < effectiveTotal - 2) pages.push("...");
    pages.push(effectiveTotal);
  }

  const btnBase = "inline-flex items-center justify-center h-8 min-w-[2rem] px-2 rounded-lg text-sm transition-colors";

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={cn(btnBase, "gap-1 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed")}
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Prev</span>
      </button>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} className="px-1 text-slate-300 text-sm">...</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                disabled={effectiveTotal <= 1}
                className={cn(
                  btnBase,
                  p === currentPage
                    ? "bg-primary text-white font-medium"
                    : "text-slate-500 hover:bg-slate-100",
                  effectiveTotal <= 1 && "cursor-default"
                )}
              >
                {p}
              </button>
            )
          )}
        </div>
        {totalItems !== undefined && (
          <span className="text-xs text-slate-400 hidden sm:inline">
            ({totalItems} {totalItems === 1 ? "item" : "items"})
          </span>
        )}
      </div>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= effectiveTotal}
        className={cn(btnBase, "gap-1 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed")}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
