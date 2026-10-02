import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import type { PlayerBadgeView } from "@/lib/badges/load";
import { badgeDescription, creditsEarned, formatBadgeDate, progressFraction, progressLabel } from "@/lib/badges/words";
import { BadgeMedallion } from "./badge-icon";

/**
 * One badge on the Achievements page. Earned: the gold medallion, the day it was earned,
 * the credits it paid and a Share action. Locked: a lock and how far the player has got.
 */
export function BadgeTile({ badge, share }: { badge: PlayerBadgeView; share?: ReactNode }) {
  const earned = badge.earned_on !== null;
  const credits = creditsEarned(badge.credits);
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5 flex flex-col items-center text-center",
        earned ? "border-slate-200 bg-white" : "border-slate-200/70 bg-white/60"
      )}
    >
      <BadgeMedallion icon={badge.icon} locked={!earned} size="lg" />
      <h3 className={cn("mt-3 font-semibold text-sm sm:text-base", earned ? "text-primary-900" : "text-slate-500")}>
        {badge.name}
      </h3>
      <p className={cn("text-xs sm:text-sm", earned ? "text-slate-500" : "text-slate-400")}>
        {badgeDescription(badge.measure, badge.threshold)}
      </p>

      {earned ? (
        <>
          <span className="mt-3 inline-flex items-center px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700">
            Earned {formatBadgeDate(badge.earned_on!, "short")}
          </span>
          {credits && <p className="mt-1.5 text-xs font-semibold text-amber-700">{credits}</p>}
          {share && <div className="mt-3">{share}</div>}
        </>
      ) : (
        <div className="mt-3 w-full">
          <p className="text-xs text-slate-500">
            {progressLabel(badge.measure, badge.value, badge.current_run, badge.threshold)}
          </p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-400"
              style={{ width: `${progressFraction(badge.measure, badge.value, badge.current_run, badge.threshold) * 100}%` }}
            />
          </div>
          {credits && <p className="mt-1.5 text-[11px] text-slate-400">{credits}</p>}
        </div>
      )}
    </div>
  );
}
