"use client";

import { useState } from "react";
import { redirect } from "next/navigation";
import { registerAdmin } from "@/lib/actions/auth";
import { Button, Input, Label, Alert } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

// Block access in production at the component level
if (process.env.NODE_ENV !== "development") {
  redirect("/");
}

export default function AdminSetupPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(form)) {
      formData.set(key, value);
    }

    const result = await registerAdmin(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Admin Setup</h1>
              <p className="text-xs text-amber-600 font-medium">Development only</p>
            </div>
          </div>

          {success ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Admin Created</h2>
              <p className="text-sm text-slate-500 mb-4">
                The admin account has been created. You can now log in with the credentials.
              </p>
              <Button onClick={() => window.location.href = "/login"} fullWidth>
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label required>First Name</Label>
                  <Input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => updateField("first_name", e.target.value)}
                    placeholder="Admin"
                    required
                  />
                </div>
                <div>
                  <Label required>Last Name</Label>
                  <Input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => updateField("last_name", e.target.value)}
                    placeholder="User"
                    required
                  />
                </div>
              </div>

              <div>
                <Label required>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  placeholder="admin@beachamp.com"
                  required
                />
              </div>

              <div>
                <Label required>Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="Min. 6 characters"
                  required
                />
              </div>

              {error && <Alert>{error}</Alert>}

              <Button type="submit" disabled={loading} fullWidth>
                {loading ? "Creating admin..." : "Create Admin Account"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
