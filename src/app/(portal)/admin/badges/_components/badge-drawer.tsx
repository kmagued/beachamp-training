"use client";

import { useState, useTransition } from "react";
import { Info, Loader2, Plus, X } from "lucide-react";
import { Button, Drawer, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { BADGE_ICON_COMPONENTS, BadgeMedallion } from "@/components/achievements/badge-icon";
import {
  BADGE_ICONS,
  MAX_TIERS,
  MEASURES,
  MEASURE_ORDER,
  TIERS,
  isMeasure,
  type BadgeIconKey,
  type TierNumber,
} from "@/lib/badges/config";
import type { BadgeField, TierInput } from "@/lib/badges/validate";
import { createBadge, updateBadge } from "@/app/_actions/badges";
import type { AdminBadge } from "./badges-client";

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs font-medium text-red-600">{message}</p>;
}

type FormError = { field: BadgeField | null; tier?: number; message: string };

export function BadgeDrawer({
  open,
  badge,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** The badge being edited, or null for a new one */
  badge: AdminBadge | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(badge?.name ?? "");
  const [icon, setIcon] = useState<BadgeIconKey>(badge?.icon ?? "shield-check");
  const [measure, setMeasure] = useState<string>(badge?.measure ?? "sessions_attended");
  // New badges start with Bronze only
  const [tiers, setTiers] = useState<TierInput[]>(
    badge
      ? badge.tiers.map((t) => ({ threshold: String(t.threshold), credits: String(t.credits) }))
      : [{ threshold: "", credits: "" }]
  );
  const [error, setError] = useState<FormError | null>(null);

  const measureInfo = isMeasure(measure) ? MEASURES[measure] : MEASURES.sessions_attended;
  const topTier = tiers.length as TierNumber;
  // Raising a number or removing a tier can take tiers back from players
  const takesBack =
    badge !== null &&
    (tiers.length < badge.tiers.length ||
      badge.tiers.some((t, i) => tiers[i] && Number(tiers[i].threshold) > t.threshold));
  const errorFor = (field: BadgeField) => (error?.field === field && error.tier === undefined ? error.message : null);
  const tierError = (i: number) => (error?.field === "tiers" && error.tier === i ? error.message : null);

  function setTier(i: number, change: Partial<TierInput>) {
    setTiers((prev) => prev.map((t, j) => (j === i ? { ...t, ...change } : t)));
  }

  function submit() {
    setError(null);
    const input = { name, icon, measure, tiers };
    startTransition(async () => {
      const res = badge ? await updateBadge(badge.id, input) : await createBadge(input);
      if ("error" in res) {
        setError({ field: res.field ?? null, tier: res.tier, message: res.error });
        return;
      }
      onSaved(badge ? "Badge updated" : `${name.trim()} created`);
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={badge ? "Edit badge" : "New badge"}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="flex-1 px-3" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button className="flex-1 px-3" onClick={submit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </span>
            ) : badge ? (
              "Save changes"
            ) : (
              "Create badge"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Preview: the medallion in the top tier's metal */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 flex flex-col items-center text-center">
          <BadgeMedallion icon={icon} tier={topTier} size="lg" />
          <p className="mt-3 font-semibold text-primary-900">{name.trim() || "Badge name"}</p>
          <p className="text-sm text-slate-500">
            {measureInfo.label} · {tiers.length === 1 ? "1 tier" : `${tiers.length} tiers`}
          </p>
        </div>

        <div>
          <Label htmlFor="badge-name" required>
            Name
          </Label>
          <Input
            id="badge-name"
            value={name}
            maxLength={40}
            placeholder="e.g. Court Regular"
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError message={errorFor("name")} />
        </div>

        <div>
          <Label required>Icon</Label>
          <div className="grid grid-cols-6 gap-2">
            {BADGE_ICONS.map((key) => {
              const Icon = BADGE_ICON_COMPONENTS[key];
              const selected = key === icon;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={key.replace("-", " ")}
                  aria-pressed={selected}
                  onClick={() => setIcon(key)}
                  className={cn(
                    "aspect-square rounded-xl border flex items-center justify-center transition-colors",
                    selected
                      ? "border-accent-500 bg-accent-50 text-accent-700 ring-2 ring-accent-300"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>
          <FieldError message={errorFor("icon")} />
        </div>

        <div>
          <Label htmlFor="badge-measure" required>
            Measure
          </Label>
          {badge ? (
            <p className="px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600">
              {measureInfo.label}
            </p>
          ) : (
            <Select id="badge-measure" value={measure} onChange={(e) => setMeasure(e.target.value)}>
              {MEASURE_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MEASURES[m].label}
                </option>
              ))}
            </Select>
          )}
          <FieldError message={errorFor("measure")} />
        </div>

        <div>
          <Label required>Tiers</Label>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2rem] sm:grid-cols-[minmax(0,1fr)_6rem_6rem_2rem] gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Tier</span>
              <span>{measureInfo.numberLabel}</span>
              <span>Credits</span>
              <span />
            </div>
            {tiers.map((tier, i) => {
              const number = (i + 1) as TierNumber;
              const removable = i === tiers.length - 1 && tiers.length > 1;
              return (
                <div key={number} className="px-3 py-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2rem] sm:grid-cols-[minmax(0,1fr)_6rem_6rem_2rem] items-center gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary-900">
                      <BadgeMedallion icon={icon} tier={number} size="xs" />
                      <span className="truncate">{TIERS[number].label}</span>
                    </span>
                    <Input
                      aria-label={`${TIERS[number].label} ${measureInfo.numberLabel.toLowerCase()}`}
                      type="number"
                      inputMode="numeric"
                      min={measureInfo.min}
                      max={1000}
                      value={tier.threshold}
                      onChange={(e) => setTier(i, { threshold: e.target.value })}
                      className="px-2.5"
                    />
                    <Input
                      aria-label={`${TIERS[number].label} credits`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10000}
                      value={tier.credits}
                      placeholder="0"
                      onChange={(e) => setTier(i, { credits: e.target.value })}
                      className="px-2.5"
                    />
                    {removable ? (
                      <button
                        type="button"
                        aria-label={`Remove ${TIERS[number].label}`}
                        onClick={() => setTiers((prev) => prev.slice(0, -1))}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                  <FieldError message={tierError(i)} />
                </div>
              );
            })}
          </div>
          {tiers.length < MAX_TIERS && (
            <button
              type="button"
              onClick={() => setTiers((prev) => [...prev, { threshold: "", credits: "" }])}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-800 hover:text-primary-900"
            >
              <Plus className="w-4 h-4" />
              Add {TIERS[(tiers.length + 1) as TierNumber].label}
            </button>
          )}
          <FieldError message={errorFor("tiers")} />
        </div>

        {takesBack && (
          <p className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <Info className="w-4 h-4 shrink-0" />
            Raising a number or removing a tier takes it, and its credits, back from players who no longer qualify.
          </p>
        )}
        {!badge && (
          <p className="flex gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600">
            <Info className="w-4 h-4 shrink-0" />
            Counts activity from today. Players who already meet it start from zero.
          </p>
        )}

        {/* An error that isn't about one field, e.g. the database refusing the save */}
        {error && error.field === null && <p className="text-sm font-medium text-red-600">{error.message}</p>}
      </div>
    </Drawer>
  );
}
