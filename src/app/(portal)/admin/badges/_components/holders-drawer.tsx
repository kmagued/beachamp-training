"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Users } from "lucide-react";
import { Drawer, EmptyState, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { BadgeMedallion } from "@/components/achievements/badge-icon";
import { TIERS, type TierNumber } from "@/lib/badges/config";
import { filterHolders, type BadgeHolder } from "@/lib/badges/holders";
import { creditsEarned, formatBadgeDate } from "@/lib/badges/words";
import { loadBadgeHolders } from "@/app/_actions/badges";
import type { AdminBadge } from "./badges-client";

/**
 * Who holds a badge: one row per player with their highest tier, filterable by tier
 * and searchable by name. Loaded when it opens, not with the page.
 */
export function HoldersDrawer({
  open,
  badge,
  initialTier,
  onClose,
}: {
  open: boolean;
  badge: AdminBadge;
  /** The tier whose count was clicked, or "all" */
  initialTier: TierNumber | "all";
  onClose: () => void;
}) {
  const [holders, setHolders] = useState<BadgeHolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<TierNumber | "all">(initialTier);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    loadBadgeHolders(badge.id).then((res) => {
      if (cancelled) return;
      if ("error" in res) setError(res.error);
      else setHolders(res.holders);
    });
    return () => {
      cancelled = true;
    };
  }, [open, badge.id]);

  const shown = useMemo(() => (holders ? filterHolders(holders, tier, search) : []), [holders, tier, search]);
  const chips: { value: TierNumber | "all"; label: string; count: number }[] = [
    { value: "all", label: "All", count: holders?.length ?? badge.holders },
    ...badge.tiers.map((t) => ({
      value: t.tier,
      label: TIERS[t.tier].label,
      count: holders ? holders.filter((h) => h.tiers.includes(t.tier)).length : t.holders,
    })),
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${badge.name} · ${badge.holders === 1 ? "1 holder" : `${badge.holders} holders`}`}
    >
      <div className="space-y-4">
        {badge.tiers.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                aria-pressed={tier === chip.value}
                onClick={() => setTier(chip.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  tier === chip.value
                    ? "border-primary-800 bg-primary-800 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                {chip.value !== "all" && <BadgeMedallion icon={badge.icon} tier={chip.value} size="xs" className="w-4 h-4 [&_svg]:w-2.5 [&_svg]:h-2.5" />}
                {chip.label}
                <span className={tier === chip.value ? "text-white/70" : "text-slate-400"}>{chip.count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players"
            aria-label="Search players"
            className="pl-9"
          />
        </div>

        {error ? (
          <p className="text-sm font-medium text-red-600">{error}</p>
        ) : holders === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : holders.length === 0 ? (
          <EmptyState icon={<Users className="w-10 h-10" />} title="Nobody holds this badge yet." />
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No players match.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {shown.map((h) => {
              const credits = creditsEarned(h.credits_paid);
              return (
                <li key={h.player_id}>
                  <Link
                    href={`/admin/players/${h.player_id}`}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <span className="w-9 h-9 shrink-0 rounded-full bg-primary-100 text-primary-800 text-xs font-bold flex items-center justify-center">
                      {h.initials}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-primary-900 truncate">{h.name}</p>
                      <p className="text-xs text-slate-500">
                        since {formatBadgeDate(h.since, "short")}
                        {credits ? ` · ${credits}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-0.5 pr-2.5 py-0.5 text-[11px] font-semibold text-primary-900">
                      <BadgeMedallion icon={badge.icon} tier={h.tier} size="xs" className="w-5 h-5 [&_svg]:w-3 [&_svg]:h-3" />
                      {TIERS[h.tier].label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
