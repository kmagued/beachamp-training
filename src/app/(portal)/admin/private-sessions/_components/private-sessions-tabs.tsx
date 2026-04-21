"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  key: string;
  label: string;
  count?: number;
  badgeTone?: "neutral" | "warning";
}

interface Props {
  tabs: Tab[];
  defaultTab?: string;
  children: Record<string, ReactNode>;
}

export function PrivateSessionsTabs({ tabs, defaultTab, children }: Props) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.key);

  return (
    <div>
      <div className="flex border-b border-slate-200 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    tab.badgeTone === "warning"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div>{children[active]}</div>
    </div>
  );
}
