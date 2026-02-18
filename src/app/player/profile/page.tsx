"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Button, Input, Select, Alert, DatePicker, Textarea, MultiSelect } from "@/components/ui";
import { branding } from "@/lib/config/branding";
import { updateProfile } from "./actions";
import type { Profile } from "@/types/database";

export default function PlayerProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trainingGoals, setTrainingGoals] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        const p = data as Profile;
        setProfile(p);
        setTrainingGoals(p.training_goals || "");
        setDateOfBirth(p.date_of_birth || "");
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(formData: FormData) {
    formData.set("training_goals", trainingGoals);
    formData.set("date_of_birth", dateOfBirth);
    setResult(null);
    startTransition(async () => {
      const res = await updateProfile(formData);
      setResult(res);
    });
  }

  if (!profile) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <Card className="animate-pulse p-6">
          <div className="h-6 bg-slate-200 rounded w-32 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-10 bg-slate-200 rounded" />
            <div className="h-10 bg-slate-200 rounded" />
            <div className="h-10 bg-slate-200 rounded" />
            <div className="h-10 bg-slate-200 rounded" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-slate-500 text-sm">Update your personal information</p>
      </div>

      {result?.success && (
        <Alert variant="success" className="mb-4">
          Profile updated successfully.
        </Alert>
      )}
      {result?.error && (
        <Alert variant="error" className="mb-4">
          {result.error}
        </Alert>
      )}

      <Card>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
                <Input value={profile.email || ""} disabled className="bg-slate-50 text-slate-400" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">First Name</label>
                  <Input name="first_name" defaultValue={profile.first_name} required />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">Last Name</label>
                  <Input name="last_name" defaultValue={profile.last_name} required />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Date of Birth</label>
                <DatePicker
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Phone</label>
                <Input name="phone" defaultValue={profile.phone || ""} />
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Area</label>
                <Select name="area" defaultValue={profile.area || ""}>
                  <option value="">Select area</option>
                  {branding.areas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Playing Level</label>
                <Select name="playing_level" defaultValue={profile.playing_level || ""}>
                  <option value="">Select level</option>
                  {branding.levels.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Training Goals</label>
                <MultiSelect
                  options={branding.trainingGoals}
                  placeholder="Select your goals..."
                  value={trainingGoals}
                  onChange={(value) => setTrainingGoals(value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Health Conditions</label>
                <Textarea
                  name="health_conditions"
                  defaultValue={profile.health_conditions || ""}
                  placeholder="List any injuries, conditions, or write 'None'"
                  rows={3}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="sm:w-auto sm:px-12">
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
