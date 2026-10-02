import Link from "next/link";
import { Check, Medal } from "lucide-react";
import { Card } from "@/components/ui";
import { TIERS } from "@/lib/badges/config";
import type { PlayerBadgeView } from "@/lib/badges/load";
import { badgeProgress, remainingLabel } from "@/lib/badges/progress";
import { tierProgress } from "@/lib/badges/words";
import { BadgeMedallion } from "./badge-icon";

/** Every badge's next tier on the dashboard, the closest first, so players see what's in reach */
export function BadgeProgressCard({ badges }: { badges: PlayerBadgeView[] }) {
  const entries = badgeProgress(badges);
  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-xl tracking-wide text-primary-900 flex items-center gap-2">
          <Medal className="w-4 h-4 text-primary-700/50" />
          Badge progress
        </h2>
        <Link
          href="/player/achievements"
          className="text-sm font-semibold text-primary-800 hover:text-primary-900 whitespace-nowrap"
        >
          All badges →
        </Link>
      </div>
      <ul className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        {entries.map(({ badge, next, fraction }) => (
          <li key={badge.id} className="flex items-center gap-3 min-w-0">
            <BadgeMedallion icon={badge.icon} tier={next?.tier ?? badge.tiers.at(-1)?.tier ?? 1} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-primary-900 truncate">
                  {next ? `${TIERS[next.tier].label} ${badge.name}` : badge.name}
                </p>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {next ? tierProgress(badge.measure, badge.value, badge.current_run, next.threshold) : null}
                </span>
              </div>
              {next ? (
                <>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-accent-400" style={{ width: `${fraction * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {remainingLabel(badge.measure, badge.value, badge.current_run, next.threshold)}
                  </p>
                </>
              ) : (
                <p className="mt-0.5 text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  All tiers earned
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
