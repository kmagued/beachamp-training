"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils/cn";

interface MultiSelectProps {
  name?: string;
  options: readonly string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  /** Controlled value as comma-separated string */
  value?: string;
  /** Called with comma-separated string */
  onChange?: (value: string) => void;
  /** Hide chips below the dropdown (default: true) */
  showChips?: boolean;
}

export function MultiSelect({
  name,
  options,
  placeholder = "Select options...",
  required,
  className,
  value,
  onChange,
  showChips = true,
}: MultiSelectProps) {
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive selected from controlled value or internal state
  const selected = useMemo(() => {
    if (value !== undefined) {
      return value ? value.split(",").filter(Boolean) : [];
    }
    return internalSelected;
  }, [value, internalSelected]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(option: string) {
    const newSelected = selected.includes(option)
      ? selected.filter((o) => o !== option)
      : [...selected, option];

    if (onChange) {
      onChange(newSelected.join(","));
    } else {
      setInternalSelected(newSelected);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Hidden input for form submission */}
      {name && <input type="hidden" name={name} value={selected.join(",")} />}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full px-4 py-2.5 rounded-lg border bg-white text-left text-sm transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
          open ? "border-primary ring-2 ring-primary/20" : "border-slate-300",
        )}
      >
        {selected.length === 0 ? (
          <span className="text-slate-400">{placeholder}</span>
        ) : (
          <span className="text-slate-900">
            {!showChips && selected.length === 1 ? selected[0] : `${selected.length} selected`}
          </span>
        )}
        <svg
          className={cn(
            "w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 transition-transform",
            open && "rotate-180"
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-60 overflow-auto">
          {options.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggle(option)}
                className={cn(
                  "w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 hover:bg-slate-50 transition-colors",
                  isSelected && "bg-primary-50"
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                    isSelected
                      ? "bg-primary border-primary"
                      : "border-slate-300"
                  )}
                >
                  {isSelected && (
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <span className={cn(isSelected ? "text-slate-900 font-medium" : "text-slate-700")}>
                  {option}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected chips */}
      {showChips && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 bg-primary-50 text-primary text-xs font-medium px-2.5 py-1 rounded-md"
            >
              {item}
              <button
                type="button"
                onClick={() => toggle(item)}
                className="hover:text-primary-700 transition-colors"
              >
                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
