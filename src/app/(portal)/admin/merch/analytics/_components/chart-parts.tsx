"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Chart chrome shared with the dashboard's income chart */
export const AXIS_TEXT = "#5A6B73";
export const GRID = "#ECE8DF";
export const BASELINE = "#C4D8DE";

export interface SeriesKey {
  key: string;
  name: string;
  color: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
            value === o.value ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A card with a title and a Chart / Table switch; the table is the accessible twin of the chart */
export function ChartCard({
  title,
  subtitle,
  tools,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  tools?: ReactNode;
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("bg-white rounded-xl border border-slate-200 p-4 min-w-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {tools}
          {table && (
            <Segmented
              label={`${title} view`}
              value={view}
              onChange={setView}
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
            />
          )}
        </div>
      </div>
      {view === "table" && table ? <div className="overflow-x-auto">{table}</div> : children}
    </section>
  );
}

export function Legend({ items }: { items: SeriesKey[] }) {
  if (items.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-slate-600">
      {items.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** Tooltip body: the value leads, the series name follows, keyed by a short line in its colour */
export function TipRows({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { key: string; color: string; value: string; label: string }[];
  total?: string;
}) {
  return (
    <div className="min-w-[170px]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{title}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="w-3 h-0.5 rounded-full shrink-0" style={{ background: r.color }} />
            <span className="font-semibold text-slate-900 tabular-nums">{r.value}</span>
            <span className="text-slate-500 truncate">{r.label}</span>
          </div>
        ))}
      </div>
      {total && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1.5 mt-1.5">
          <span className="text-slate-500">Total</span>
          <span className="font-semibold text-slate-900 tabular-nums">{total}</span>
        </div>
      )}
    </div>
  );
}

/** Hover or focus tooltip for plain HTML marks (bars, columns, share segments) */
export function HoverTip({
  tip,
  children,
  className,
  style,
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      tabIndex={0}
      className={cn("relative outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-sm", className)}
      style={style}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
        >
          {tip}
        </span>
      )}
    </span>
  );
}
