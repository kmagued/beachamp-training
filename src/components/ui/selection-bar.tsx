import { type ReactNode } from "react";
import { XCircle } from "lucide-react";

interface SelectionBarProps {
  count: number;
  onClear: () => void;
  children?: ReactNode;
}

export function SelectionBar({ count, onClear, children }: SelectionBarProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
      <span className="text-sm font-medium text-primary">
        {count} selected
      </span>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <XCircle className="w-3.5 h-3.5" /> Clear
      </button>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
