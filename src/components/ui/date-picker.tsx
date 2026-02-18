"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils/cn";

interface DatePickerProps {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  className?: string;
  name?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select date...",
  className,
  name,
}: DatePickerProps) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse the controlled value (YYYY-MM-DD)
  const selectedDate = useMemo(() => {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    return { year: y, month: m - 1, day: d };
  }, [value]);

  // When opening, navigate to the selected date's month
  useEffect(() => {
    if (open && selectedDate) {
      setViewYear(selectedDate.year);
      setViewMonth(selectedDate.month);
    }
  }, [open, selectedDate]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectDay(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange?.({ target: { value: `${viewYear}-${m}-${d}` } });
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // Format display value
  const displayValue = useMemo(() => {
    if (!selectedDate) return null;
    return `${selectedDate.day} ${MONTHS[selectedDate.month]} ${selectedDate.year}`;
  }, [selectedDate]);

  // Build calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  // Year options (80 years back from current year)
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = today.getFullYear(); y >= today.getFullYear() - 80; y--) {
      years.push(y);
    }
    return years;
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value || ""} />}

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
        {displayValue ? (
          <span className="text-slate-900">{displayValue}</span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <svg
          className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {/* Calendar Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[300px] bg-white border border-slate-200 rounded-xl shadow-lg p-4">
          {/* Month/Year Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>

            <div className="flex items-center gap-2">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="text-sm font-semibold text-slate-900 bg-transparent border-none cursor-pointer focus:outline-none"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="text-sm font-semibold text-slate-900 bg-transparent border-none cursor-pointer focus:outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={nextMonth}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-1.5">
                {d}
              </div>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - firstDay + 1;
              const isValidDay = day >= 1 && day <= daysInMonth;
              const isSelected =
                isValidDay &&
                selectedDate?.year === viewYear &&
                selectedDate?.month === viewMonth &&
                selectedDate?.day === day;
              const isToday =
                isValidDay &&
                today.getFullYear() === viewYear &&
                today.getMonth() === viewMonth &&
                today.getDate() === day;

              if (!isValidDay) {
                return <div key={i} />;
              }

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={cn(
                    "w-full aspect-square flex items-center justify-center text-sm rounded-lg transition-colors",
                    isSelected
                      ? "bg-primary text-white font-semibold"
                      : isToday
                        ? "bg-cyan-50 text-primary font-medium"
                        : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
