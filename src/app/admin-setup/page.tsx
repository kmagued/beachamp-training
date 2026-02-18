"use client";

import { useState } from "react";
import { registerAdmin } from "@/lib/actions/auth";
import { Button, Input, Label, Alert } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function AdminSetupPage() {
  const [error, setError] = useState<string | null>(null);
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
    }
    // On success, server action redirects to /verify-email
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
              <p className="text-xs text-slate-500">Create an admin account</p>
            </div>
          </div>

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
        </div>
      </div>
    </div>
  );
}
