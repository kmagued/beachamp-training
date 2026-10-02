import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { awardSummary, placeLabel } from "@/lib/king-of-court/awards";
import type { PlayerAward } from "@/lib/king-of-court/awards-load";
import { formatMonth } from "@/lib/king-of-court/format";

/** One monthly award on the Achievements page: gold for 1st place, plain for 2nd */
export function AwardCard({ award, share }: { award: PlayerAward; share?: ReactNode }) {
  const first = award.place === 1;
  return (
    <div
      className={cn(
        "rounded-2xl border p-5 sm:p-6 flex flex-col",
        first ? "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
            first ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
          )}
        >
          <Trophy className="w-6 h-6" />
        </div>
        {/* Not the Badge component: that capitalises every word ("1st Place") */}
        <span
          className={cn(
            "inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap",
            first ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {placeLabel(award.place)}
        </span>
      </div>
      <h3 className="mt-4 font-display text-2xl sm:text-3xl tracking-wide uppercase text-primary-900">
        {formatMonth(award.month, "long")}
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        {award.group_name} · {awardSummary(award.points, award.sessions)}
      </p>
      {share && <div className="mt-auto pt-5">{share}</div>}
    </div>
  );
}
