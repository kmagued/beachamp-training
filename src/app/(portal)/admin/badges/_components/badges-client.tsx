"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Medal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Toast } from "@/components/ui";
import { BadgeMedallion } from "@/components/achievements/badge-icon";
import type { BadgeIconKey, Measure } from "@/lib/badges/config";
import { badgeDescription, creditsEarned, deleteBadgeWarning, formatBadgeDate, holdersLabel } from "@/lib/badges/words";
import { deleteBadge } from "@/app/_actions/badges";
import { BadgeDrawer } from "./badge-drawer";

export interface AdminBadge {
  id: string;
  name: string;
  icon: BadgeIconKey;
  measure: Measure;
  threshold: number;
  credits: number;
  /** YYYY-MM-DD: only activity from this day counts */
  counts_from: string;
  holders: number;
}

export function BadgesClient({ badges }: { badges: AdminBadge[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // A fresh key remounts the drawer so its form starts from the badge being edited
  const [drawer, setDrawer] = useState<{ badge: AdminBadge | null; key: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminBadge | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  function openDrawer(badge: AdminBadge | null) {
    setDrawer((prev) => ({ badge, key: (prev?.key ?? 0) + 1 }));
    setDrawerOpen(true);
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
            const credits = creditsEarned(badge.credits);
            return (
              <div
                key={badge.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 flex flex-col items-center text-center"
              >
                <BadgeMedallion icon={badge.icon} size="lg" />
                <h3 className="mt-4 text-lg font-semibold text-primary-900">{badge.name}</h3>
                <p className="text-sm text-slate-500">{badgeDescription(badge.measure, badge.threshold)}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {credits && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800">
                      {credits}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    {holdersLabel(badge.holders)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Counting since {formatBadgeDate(badge.counts_from, "medium")}
                </p>
                <div className="mt-5 flex w-full gap-2">
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

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={deleting ? `Delete ${deleting.name}?` : "Delete badge?"}
        description={deleting ? deleteBadgeWarning(deleting.name, deleting.holders, deleting.credits) : undefined}
        confirmLabel="Delete badge"
        loading={isPending}
      />
    </div>
  );
}
