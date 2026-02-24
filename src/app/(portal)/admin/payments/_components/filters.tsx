import { Input, MultiSelect, MobileFilterSheet } from "@/components/ui";
import { Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SortField, SortDir } from "./types";

const STATUS_OPTIONS = ["Pending", "Confirmed", "Rejected"] as const;

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "status", label: "Status" },
];

interface PaymentsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  packageFilter: string;
  onPackageFilterChange: (value: string) => void;
  packageOptions: readonly string[];
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

export function PaymentsFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  packageFilter,
  onPackageFilterChange,
  packageOptions,
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
}: PaymentsFiltersProps) {
  const activeFilterCount = [statusFilter, monthFilter, packageFilter, typeFilter].filter(Boolean).length;

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
      <MultiSelect
        options={STATUS_OPTIONS}
        value={statusFilter}
        onChange={onStatusFilterChange}
        placeholder="All Status"
        showChips={false}
        className="sm:w-44"
      />
      {packageOptions.length > 0 && (
        <MultiSelect
          options={packageOptions}
          value={packageFilter}
          onChange={onPackageFilterChange}
          placeholder="All Packages"
          showChips={false}
          className="sm:w-48"
        />
      )}
      <select
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value)}
        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer sm:w-40"
      >
        <option value="">All Types</option>
        <option value="player">Player Payments</option>
        <option value="quick">Quick Payments</option>
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
            placeholder="Search by player name..."
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
