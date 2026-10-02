"use client";

import { useState, useTransition } from "react";
import { Info, Loader2 } from "lucide-react";
import { Button, Drawer, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { BADGE_ICON_COMPONENTS, BadgeMedallion } from "@/components/achievements/badge-icon";
import { BADGE_ICONS, MEASURES, MEASURE_ORDER, isMeasure, type BadgeIconKey } from "@/lib/badges/config";
import type { BadgeField } from "@/lib/badges/validate";
import { badgeDescription, creditsEarned } from "@/lib/badges/words";
import { createBadge, updateBadge } from "@/app/_actions/badges";
import type { AdminBadge } from "./badges-client";

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs font-medium text-red-600">{message}</p>;
}

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
  const [threshold, setThreshold] = useState(badge ? String(badge.threshold) : "");
  const [credits, setCredits] = useState(badge ? String(badge.credits) : "");
  const [error, setError] = useState<{ field: BadgeField | null; message: string } | null>(null);

  const measureInfo = isMeasure(measure) ? MEASURES[measure] : MEASURES.sessions_attended;
  // The preview reads sensibly while the number is still being typed
  const previewNumber = Number(threshold) >= measureInfo.min ? Math.floor(Number(threshold)) : measureInfo.min;
  const previewCredits = creditsEarned(Math.max(0, Math.floor(Number(credits) || 0)));
  const raising = badge !== null && Number(threshold) > badge.threshold;
  const errorFor = (field: BadgeField) => (error?.field === field ? error.message : null);

  function submit() {
    setError(null);
    const input = { name, icon, measure, threshold, credits };
    startTransition(async () => {
      const res = badge ? await updateBadge(badge.id, input) : await createBadge(input);
      if ("error" in res) {
        setError({ field: res.field ?? null, message: res.error });
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
        {/* Live preview, as players will see the earned badge */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 flex flex-col items-center text-center">
          <BadgeMedallion icon={icon} size="lg" />
          <p className="mt-3 font-semibold text-primary-900">{name.trim() || "Badge name"}</p>
          <p className="text-sm text-slate-500">
            {badgeDescription(isMeasure(measure) ? measure : "sessions_attended", previewNumber)}
          </p>
          {previewCredits && (
            <span className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800">
              {previewCredits}
            </span>
          )}
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="badge-threshold" required>
              {measureInfo.numberLabel}
            </Label>
            <Input
              id="badge-threshold"
              type="number"
              inputMode="numeric"
              min={measureInfo.min}
              max={1000}
              value={threshold}
              placeholder={String(Math.max(measureInfo.min, 10))}
              onChange={(e) => setThreshold(e.target.value)}
            />
            <FieldError message={errorFor("threshold")} />
          </div>
          <div>
            <Label htmlFor="badge-credits">Credits</Label>
            <Input
              id="badge-credits"
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              value={credits}
              placeholder="0"
              onChange={(e) => setCredits(e.target.value)}
            />
            <FieldError message={errorFor("credits")} />
          </div>
        </div>

        {raising && (
          <p className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <Info className="w-4 h-4 shrink-0" />
            Raising it takes the badge, and its credits, back from players who no longer qualify.
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
