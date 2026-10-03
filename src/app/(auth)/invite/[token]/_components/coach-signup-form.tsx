"use client";

import { useState } from "react";
import { acceptCoachInvite } from "@/app/_actions/coach-invites";
import { Alert, Button, Input, Label } from "@/components/ui";

interface CoachSignupFormProps {
  token: string;
  invite: { first_name: string; last_name: string; phone: string; email: string | null };
}

/** The invited coach's signup, prefilled from the invite */
export function CoachSignupForm({ token, invite }: CoachSignupFormProps) {
  const [form, setForm] = useState({
    first_name: invite.first_name,
    last_name: invite.last_name,
    email: invite.email ?? "",
    phone: invite.phone,
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField(name: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(form)) formData.set(key, value);

    // On success the action redirects to the email-code page
    const result = await acceptCoachInvite(token, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      {error && <Alert className="mb-6">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>First Name</Label>
            <Input
              value={form.first_name}
              onChange={(e) => updateField("first_name", e.target.value)}
              required
              autoComplete="given-name"
            />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input
              value={form.last_name}
              onChange={(e) => updateField("last_name", e.target.value)}
              required
              autoComplete="family-name"
            />
          </div>
        </div>

        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => updateField("email", e.target.value)}
            required
            placeholder="you@example.com"
            autoComplete="email"
          />
          <p className="text-[11px] text-primary-700/50 mt-1">We&apos;ll email you a code to confirm it.</p>
        </div>

        <div>
          <Label>Phone</Label>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            required
            autoComplete="tel"
          />
        </div>

        <div>
          <Label>Password</Label>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => updateField("password", e.target.value)}
            required
            minLength={6}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
        </div>

        <Button type="submit" disabled={loading} fullWidth>
          {loading ? "Creating your account..." : "Create Coach Account"}
        </Button>
      </form>
    </>
  );
}
