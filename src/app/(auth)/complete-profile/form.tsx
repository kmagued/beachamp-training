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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Playing Level */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Playing Level</h3>
            <p className="text-slate-400 text-xs">How would you rate your current skill level?</p>
          </div>
        </div>
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

      {/* Training Goals */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Training Goals</h3>
            <p className="text-slate-400 text-xs">What do you want to achieve?</p>
          </div>
        </div>
        <MultiSelect
          options={branding.trainingGoals}
          placeholder="Select your goals..."
          value={form.training_goals}
          onChange={(value) => updateField("training_goals", value)}
        />
      </div>

      {/* Health Conditions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Health Information</h3>
            <p className="text-slate-400 text-xs">Anything the coach should know about?</p>
          </div>
        </div>
        <Textarea
          value={form.health_conditions}
          onChange={(e) => updateField("health_conditions", e.target.value)}
          placeholder="List any injuries, conditions, or write 'None'"
        />
      </div>

      {/* Package Selection */}
      {packages.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm">Preferred Package</h3>
              <p className="text-slate-400 text-xs">You can change this later</p>
            </div>
          </div>
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

      {error && <Alert>{error}</Alert>}

      <Button type="submit" disabled={loading} fullWidth>
        {loading ? "Saving..." : "Complete Profile"}
      </Button>
    </form>
  );
}
