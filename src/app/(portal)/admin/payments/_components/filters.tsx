import { Input, MultiSelect } from "@/components/ui";
import { Search, RotateCcw } from "lucide-react";

const STATUS_OPTIONS = ["Pending", "Confirmed", "Rejected"] as const;

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
  onReset,
  hasActiveFilters,
}: PaymentsFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by player name..."
          className="pl-9"
        />
      </div>
      <select
        value={monthFilter}
        onChange={(e) => onMonthFilterChange(e.target.value)}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer sm:w-44"
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
      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 h-10 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      )}
    </div>
  );
}
