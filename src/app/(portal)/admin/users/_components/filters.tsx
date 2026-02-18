import { Input, MultiSelect } from "@/components/ui";
import { Search, RotateCcw } from "lucide-react";

const ROLE_OPTIONS = ["Player", "Coach", "Admin"] as const;
const STATUS_OPTIONS = ["Active", "Inactive"] as const;

interface UsersFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

export function UsersFilters({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  onReset,
  hasActiveFilters,
}: UsersFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or email..."
          className="pl-9"
        />
      </div>
      <MultiSelect
        options={ROLE_OPTIONS}
        value={roleFilter}
        onChange={onRoleFilterChange}
        placeholder="All Roles"
        showChips={false}
        className="sm:w-40"
      />
      <MultiSelect
        options={STATUS_OPTIONS}
        value={statusFilter}
        onChange={onStatusFilterChange}
        placeholder="All Status"
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
    </div>
  );
}
