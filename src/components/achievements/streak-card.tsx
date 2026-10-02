import { Flame } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { streakMessage, type MarkStatus, type StreakSummary } from "@/lib/badges/streak";

const DOT: Record<MarkStatus, { className: string; label: string }> = {
  present: { className: "bg-accent-500", label: "Present" },
  absent: { className: "border-2 border-red-400 bg-white", label: "Absent" },
  excused: { className: "bg-slate-300", label: "Excused" },
};

/** The dashboard's streak: the run now, the last few sessions as dots, and a nudge */
export function StreakCard({ streak }: { streak: StreakSummary }) {
  return (
    <Card className="h-full">
      <h2 className="font-display text-xl tracking-wide text-primary-900 flex items-center gap-2">
        <Flame className="w-4 h-4 text-accent-600" />
        Attendance streak
      </h2>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-5xl leading-none text-primary-900">{streak.current}</span>
        <span className="text-sm text-slate-500">{streak.current === 1 ? "session" : "sessions"} in a row</span>
      </div>
      {streak.recent.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5" aria-label="Your last sessions, oldest first">
          {streak.recent.map((status, i) => (
            <span
              key={i}
              title={DOT[status].label}
              aria-label={DOT[status].label}
              className={cn("w-3.5 h-3.5 rounded-full", DOT[status].className)}
            />
          ))}
        </div>
      )}
      <p className="mt-3 text-sm text-slate-600">{streakMessage(streak.current, streak.best)}</p>
    </Card>
  );
}
