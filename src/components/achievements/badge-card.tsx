import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { MEASURES, TIERS } from "@/lib/badges/config";
import type { PlayerBadgeView, PlayerTierView } from "@/lib/badges/load";
import { creditsEarned, formatBadgeDate, progressFraction, tierProgress, tierRequirement } from "@/lib/badges/words";
import { BadgeMedallion } from "./badge-icon";

/**
 * One badge on the Achievements page: its name and measure, then a tile for every tier.
 * Earned tiers show their metal, the day and the credits actually paid; the next tier
 * shows how far the player has got; tiers beyond it just show what they take.
 */
export function BadgeCard({
  badge,
  share,
}: {
  badge: PlayerBadgeView;
  /** The Share button for an earned tier */
  share?: (tier: PlayerTierView) => ReactNode;
}) {
  const earned = badge.tiers.filter((t) => t.earned_on !== null);
  const top = earned.at(-1);
  const next = badge.tiers.find((t) => t.earned_on === null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <BadgeMedallion icon={badge.icon} tier={top?.tier ?? 1} locked={!top} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-primary-900 truncate">{badge.name}</h3>
          <p className="text-xs text-slate-500">{MEASURES[badge.measure].label}</p>
        </div>
        <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {earned.length} of {badge.tiers.length}
        </span>
      </div>

      {/* Sideways on phones; five across from tablet width */}
      <div className="mt-4 -mx-4 px-4 scroll-px-4 pb-1 flex gap-3 overflow-x-auto snap-x sm:mx-0 sm:px-0 sm:scroll-px-0 sm:pb-0 sm:grid sm:grid-cols-5 sm:overflow-visible">
        {badge.tiers.map((tier) => {
          const isEarned = tier.earned_on !== null;
          const isNext = tier === next;
          const paid = isEarned ? creditsEarned(tier.credits_paid ?? 0) : null;
          return (
            <div
              key={tier.id}
              className={cn(
                "snap-start shrink-0 w-[7.5rem] sm:w-auto rounded-xl border p-3 flex flex-col items-center text-center",
                isEarned ? "border-slate-200 bg-white" : "border-slate-200/70 bg-slate-50/70"
              )}
            >
              <BadgeMedallion icon={badge.icon} tier={tier.tier} locked={!isEarned} size="md" />
              <p className={cn("mt-2 text-sm font-semibold", isEarned ? "text-primary-900" : "text-slate-500")}>
                {TIERS[tier.tier].label}
              </p>
              <p className={cn("text-xs", isEarned ? "text-slate-500" : "text-slate-400")}>
                {tierRequirement(badge.measure, tier.threshold)}
              </p>

              {isEarned ? (
                <>
                  <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
                    {formatBadgeDate(tier.earned_on!, "short")}
                  </span>
                  {paid && <p className="mt-1 text-[11px] font-semibold text-amber-700">{paid}</p>}
                  {share && <div className="mt-2">{share(tier)}</div>}
                </>
              ) : isNext ? (
                <div className="mt-2 w-full">
                  <p className="text-[11px] font-medium text-slate-500">
                    {tierProgress(badge.measure, badge.value, badge.current_run, tier.threshold)}
                  </p>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200/70 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent-400"
                      style={{
                        width: `${progressFraction(badge.measure, badge.value, badge.current_run, tier.threshold) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
