import { Input, MobileFilterSheet } from "@/components/ui";
import { Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SortField, SortDir } from "./types";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "category", label: "Category" },
];

interface ExpensesFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: readonly string[];
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  monthOptions: readonly string[];
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

export function ExpensesFilters({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  monthFilter,
  onMonthFilterChange,
  monthOptions,
  typeFilter,
  onTypeFilterChange,
  sortField,
  sortDir,
  onSortChange,
  onReset,
  hasActiveFilters,
}: ExpensesFiltersProps) {
  const activeFilterCount = [categoryFilter, monthFilter, typeFilter].filter(Boolean).length;

  const filterDropdowns = (
    <>
      <select
        value={monthFilter}
        onChange={(e) => onMonthFilterChange(e.target.value)}
        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer sm:w-44"
      >
        <option value="">All Months</option>
        {monthOptions.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select
        value={categoryFilter}
        onChange={(e) => onCategoryFilterChange(e.target.value)}
        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer sm:w-44"
      >
        <option value="">All Categories</option>
        {categoryOptions.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value)}
        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer sm:w-36"
      >
        <option value="">All Types</option>
        <option value="one-time">One-time</option>
        <option value="recurring">Recurring</option>
      </select>
      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 h-10 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      )}
    </>
  );

  const sortSection = (
    <div className="sm:hidden">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sort by</p>
      <div className="flex flex-wrap gap-2">
        {SORT_OPTIONS.map((opt) => {
          const isActive = sortField === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onSortChange(opt.value)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 border border-primary-200"
                  : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
              )}
            >
              {opt.label} {isActive && (sortDir === "asc" ? "↑" : "↓")}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-6">
        <div className="relative flex-1 sm:min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by description..."
            className="pl-9"
          />
        </div>
        <div className="hidden sm:contents">
          {filterDropdowns}
        </div>
      </div>

      <MobileFilterSheet activeCount={activeFilterCount} title="Sort & Filters">
        {filterDropdowns}
        <div className="border-t border-slate-200 pt-4 mt-2">
          {sortSection}
        </div>
      </MobileFilterSheet>
    </>
  );
}
