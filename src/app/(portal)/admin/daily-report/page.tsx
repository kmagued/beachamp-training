"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, Receipt, CreditCard, UserCheck, Trophy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format-date";
import { DatePicker } from "@/components/ui";
import { AttendanceTab } from "./_components/attendance-tab";
import { ScoresTab } from "./_components/scores-tab";
import { CoachesTab } from "./_components/coaches-tab";
import { ExpensesTab } from "./_components/expenses-tab";
import { PaymentsTab } from "./_components/payments-tab";

const TABS = [
  { key: "attendance", label: "Attendance", icon: ClipboardCheck },
  { key: "scores", label: "Scores", icon: Trophy },
  { key: "coaches", label: "Coaches", icon: UserCheck },
  { key: "expenses", label: "Expenses", icon: Receipt },
  { key: "payments", label: "Payments", icon: CreditCard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

export default function DailyReportPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const today = new Date().toISOString().split("T")[0];
  const selectedDate = searchParams.get("date") || today;

  // The open tab lives in ?tab= so a link can open the report on a given tab (the King
  // of Court leaderboard links straight to Scores). Attendance is the default and is
  // left out of the URL.
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTabState] = useState<TabKey>(isTabKey(tabParam) ? tabParam : "attendance");

  const setActiveTab = useCallback((tab: TabKey) => {
    setActiveTabState(tab);
    // History API rather than router.replace: a tab switch needs no server round trip,
    // and Next keeps useSearchParams in step with replaceState
    const params = new URLSearchParams(window.location.search);
    if (tab === "attendance") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname]);

  const setSelectedDate = useCallback((date: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (date === today) {
      params.delete("date");
    } else {
      params.set("date", date);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname, today]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 space-y-3 sm:space-y-0 sm:flex sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Daily Report</h1>
          <p className="text-slate-500 text-sm">
            {formatDate(selectedDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
          <DatePicker
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value as string)}
            placeholder="Select date"
            className="flex-1 sm:w-48"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "attendance" && <AttendanceTab date={selectedDate} />}
      {activeTab === "scores" && <ScoresTab date={selectedDate} onOpenAttendance={() => setActiveTab("attendance")} />}
      {activeTab === "coaches" && <CoachesTab date={selectedDate} />}
      {activeTab === "expenses" && <ExpensesTab date={selectedDate} />}
      {activeTab === "payments" && <PaymentsTab date={selectedDate} />}
    </div>
  );
}
