"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Medal, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Toast } from "@/components/ui";
import { BadgeMedallion } from "@/components/achievements/badge-icon";
import { MEASURES, TIERS, type BadgeIconKey, type Measure, type TierNumber } from "@/lib/badges/config";
import { creditsEarned, deleteBadgeWarning, formatBadgeDate, playersCount, tierRequirement } from "@/lib/badges/words";
import { deleteBadge } from "@/app/_actions/badges";
import { BadgeDrawer } from "./badge-drawer";
import { HoldersDrawer } from "./holders-drawer";

export interface AdminBadgeTier {
  id: string;
  tier: TierNumber;
  threshold: number;
  credits: number;
  /** Players holding this tier */
  holders: number;
}

export interface AdminBadge {
  id: string;
  name: string;
  icon: BadgeIconKey;
  measure: Measure;
  /** YYYY-MM-DD: only activity from this day counts */
  counts_from: string;
  /** Bronze first */
  tiers: AdminBadgeTier[];
  /** Players holding any tier */
  holders: number;
  /** Credits actually paid for its tiers, which can differ from what they pay now */
  credits_paid: number;
}

export function BadgesClient({ badges }: { badges: AdminBadge[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // A fresh key remounts the drawer so its form starts from the badge being edited
  const [drawer, setDrawer] = useState<{ badge: AdminBadge | null; key: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminBadge | null>(null);
  // A fresh key per opening, so each badge's holders load afresh
  const [holders, setHolders] = useState<{ badge: AdminBadge; tier: TierNumber | "all"; key: number } | null>(null);
  const [holdersOpen, setHoldersOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  function openDrawer(badge: AdminBadge | null) {
    setDrawer((prev) => ({ badge, key: (prev?.key ?? 0) + 1 }));
    setDrawerOpen(true);
  }

  function openHolders(badge: AdminBadge, tier: TierNumber | "all") {
    setHolders((prev) => ({ badge, tier, key: (prev?.key ?? 0) + 1 }));
    setHoldersOpen(true);
  }

  function handleSaved(message: string) {
    setToast({ message, variant: "success" });
    setDrawerOpen(false);
    router.refresh();
  }

  function handleDelete() {
    if (!deleting) return;
    const badge = deleting;
    startTransition(async () => {
      const res = await deleteBadge(badge.id);
      setDeleting(null);
      if ("error" in res) {
        setToast({ message: res.error, variant: "error" });
        return;
      }
      setToast({ message: `${badge.name} deleted`, variant: "success" });
      router.refresh();
    });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Toast message={toast?.message ?? null} variant={toast?.variant} onClose={() => setToast(null)} />

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Badges</h1>
          <p className="text-slate-500 text-sm">
            Players earn these automatically. Each one counts from the day it&apos;s added.
          </p>
        </div>
        {badges.length > 0 && (
          <Button size="sm" className="px-4" onClick={() => openDrawer(null)}>
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              New badge
            </span>
          </Button>
        )}
      </div>

      {badges.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Medal className="w-10 h-10" />}
            title="No badges yet"
            description="Create one to start rewarding players."
            action={
              <Button size="sm" onClick={() => openDrawer(null)}>
                New badge
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((badge) => {
            const top = badge.tiers.at(-1)?.tier ?? 1;
            return (
              <div key={badge.id} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 flex flex-col">
                <div className="flex items-center gap-3">
                  <BadgeMedallion icon={badge.icon} tier={top} size="md" />
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-primary-900 truncate">{badge.name}</h3>
                    <p className="text-sm text-slate-500">{MEASURES[badge.measure].label}</p>
                  </div>
                </div>

                <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {badge.tiers.map((tier) => {
                    const credits = creditsEarned(tier.credits);
                    return (
                      <li key={tier.id} className="flex items-center gap-2.5 px-3 py-2">
                        <BadgeMedallion icon={badge.icon} tier={tier.tier} size="xs" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-primary-900">
                            {TIERS[tier.tier].label} · {tierRequirement(badge.measure, tier.threshold)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {credits ? `${credits} · ` : ""}
                            {tier.holders > 0 ? (
                              <button
                                type="button"
                                onClick={() => openHolders(badge, tier.tier)}
                                className="font-medium text-primary-800 underline-offset-2 hover:underline"
                              >
                                {playersCount(tier.holders)}
                              </button>
                            ) : (
                              playersCount(tier.holders)
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <button
                  type="button"
                  onClick={() => openHolders(badge, "all")}
                  className="mt-3 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary-800 hover:text-primary-900"
                >
                  <Users className="w-4 h-4" />
                  View holders ({badge.holders})
                </button>

                <p className="mt-3 text-xs text-slate-400">
                  Counting since {formatBadgeDate(badge.counts_from, "medium")}
                </p>
                <div className="mt-auto pt-4 flex w-full gap-2">
                  <Button variant="outline" className="flex-1 px-3" onClick={() => openDrawer(badge)}>
                    <span className="flex items-center justify-center gap-1.5">
                      <Pencil className="w-4 h-4" />
                      Edit
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleting(badge)}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {drawer && (
        <BadgeDrawer
          key={drawer.key}
          open={drawerOpen}
          badge={drawer.badge}
          onClose={() => setDrawerOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {holders && (
        <HoldersDrawer
          key={holders.key}
          open={holdersOpen}
          badge={holders.badge}
          initialTier={holders.tier}
          onClose={() => setHoldersOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={deleting ? `Delete ${deleting.name}?` : "Delete badge?"}
        description={deleting ? deleteBadgeWarning(deleting.name, deleting.holders, deleting.credits_paid) : undefined}
        confirmLabel="Delete badge"
        loading={isPending}
      />
    </div>
  );
}
