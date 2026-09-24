import { cn } from "@/lib/utils/cn";
import type { EntryKind } from "./types";

interface EntryTypeSwitchProps {
  value: EntryKind;
  onChange: (value: EntryKind) => void;
}

/** Expense / Income toggle shown at the top of the add drawers */
export function EntryTypeSwitch({ value, onChange }: EntryTypeSwitchProps) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
      <button
        type="button"
        onClick={() => onChange("expense")}
        className={cn(
          "py-2 text-sm font-medium rounded-md transition-colors",
          value === "expense"
            ? "bg-white text-red-600 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        Expense
      </button>
      <button
        type="button"
        onClick={() => onChange("income")}
        className={cn(
          "py-2 text-sm font-medium rounded-md transition-colors",
          value === "income"
            ? "bg-white text-emerald-600 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        Income
      </button>
    </div>
  );
}
