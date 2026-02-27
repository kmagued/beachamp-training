import { Input, MultiSelect, MobileFilterSheet } from "@/components/ui";
import { Search, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SortField, SortDir } from "./types";

const ACTIVITY_OPTIONS = ["Active", "Inactive"] as const;
const SUBSCRIPTION_OPTIONS = ["Active", "Attended", "Expiring Soon", "Expired", "Pending", "No Sub"] as const;
const LEVEL_OPTIONS = ["Beginner", "Intermediate", "Advanced", "Professional"] as const;

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "date", label: "Joined" },
  { value: "level", label: "Level" },
  { value: "package", label: "Package" },
  { value: "sessions", label: "Sessions" },
  { value: "expires", label: "Expires" },
  { value: "subscription", label: "Subscription" },
];

interface PlayersFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  activityFilter: string;
  onActivityFilterChange: (value: string) => void;
  subscriptionFilter: string;
  onSubscriptionFilterChange: (value: string) => void;
  levelFilter: string;
  onLevelFilterChange: (value: string) => void;
  packageFilter: string;
  onPackageFilterChange: (value: string) => void;
  packageOptions: string[];
  sortField: SortField;
  sortDir: SortDir;
  onSortChange: (field: SortField) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

export function PlayersFilters({
  search,
  onSearchChange,
  activityFilter,
  onActivityFilterChange,
  subscriptionFilter,
  onSubscriptionFilterChange,
  levelFilter,
  onLevelFilterChange,
  packageFilter,
  onPackageFilterChange,
  packageOptions,
  sortField,
  sortDir,
  onSortChange,
  onReset,
  hasActiveFilters,
}: PlayersFiltersProps) {
  const activeFilterCount = [activityFilter, subscriptionFilter, levelFilter, packageFilter].filter(Boolean).length;

  const filterDropdowns = (
    <>
      <MultiSelect
        options={ACTIVITY_OPTIONS}
        value={activityFilter}
        onChange={onActivityFilterChange}
        placeholder="All Activity"
        showChips={false}
        className="sm:w-36"
      />
      <MultiSelect
        options={SUBSCRIPTION_OPTIONS}
        value={subscriptionFilter}
        onChange={onSubscriptionFilterChange}
        placeholder="All Subscriptions"
        showChips={false}
        className="sm:w-44"
      />
      <MultiSelect
        options={LEVEL_OPTIONS}
        value={levelFilter}
        onChange={onLevelFilterChange}
        placeholder="All Levels"
        showChips={false}
        className="sm:w-40"
      />
      <MultiSelect
        options={packageOptions}
        value={packageFilter}
        onChange={onPackageFilterChange}
        placeholder="All Packages"
        showChips={false}
        className="sm:w-40"
      />
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
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-6">
        <div className="relative w-full sm:w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or email..."
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
