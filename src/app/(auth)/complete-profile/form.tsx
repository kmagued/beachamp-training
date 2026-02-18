"use client";

import { useState } from "react";
import { completeProfile } from "@/lib/actions/auth";
import { branding } from "@/lib/config/branding";
import { cn } from "@/lib/utils/cn";
import {
  Button,
  Select,
  Label,
  Alert,
  Textarea,
  MultiSelect,
} from "@/components/ui";
import type { Package } from "@/types/database";

interface CompleteProfileFormProps {
  packages: Package[];
}

export function CompleteProfileForm({ packages }: CompleteProfileFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    playing_level: "",
    training_goals: "",
    health_conditions: "",
    preferred_package_id: "",
  });

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate(): string | null {
    if (!form.playing_level) return "Playing level is required";
    if (!form.training_goals) return "Please select at least one training goal";
    if (!form.health_conditions.trim()) return "Health conditions field is required";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(form)) {
      formData.set(key, value);
    }

    const result = await completeProfile(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      {error && <Alert className="mb-6">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label required>Playing Level</Label>
          <Select
            value={form.playing_level}
            onChange={(e) => updateField("playing_level", e.target.value)}
          >
            <option value="">Select level...</option>
            {branding.levels.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label required>Training Goals</Label>
          <MultiSelect
            options={branding.trainingGoals}
            placeholder="Select your goals..."
            value={form.training_goals}
            onChange={(value) => updateField("training_goals", value)}
          />
        </div>

        <div>
          <Label required>
            Do you have any injuries or health conditions the coach should know about?
          </Label>
          <Textarea
            value={form.health_conditions}
            onChange={(e) => updateField("health_conditions", e.target.value)}
            placeholder="List any injuries, conditions, or write 'None'"
          />
        </div>

        {packages.length > 0 && (
          <div>
            <Label>Preferred Package</Label>
            <div className="grid grid-cols-2 gap-3">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => updateField("preferred_package_id", pkg.id)}
                  className={cn(
                    "border rounded-xl p-4 text-left transition-all",
                    form.preferred_package_id === pkg.id
                      ? "border-primary bg-cyan-50 ring-1 ring-primary/20"
                      : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className="text-lg font-bold text-slate-900">
                    {pkg.session_count} {pkg.session_count === 1 ? "session" : "sessions"}
                  </div>
                  {pkg.validity_days > 1 && (
                    <div className="text-xs text-slate-500 mb-2">
                      Valid for {pkg.validity_days} days
                    </div>
                  )}
                  <div className="text-sm font-semibold text-primary">
                    {pkg.price} EGP
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <Button type="submit" disabled={loading} fullWidth className="mt-2">
          {loading ? "Saving..." : "Complete Profile"}
        </Button>
      </form>
    </>
  );
}
