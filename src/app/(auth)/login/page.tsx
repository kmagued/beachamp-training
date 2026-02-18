"use client";

import { useState, useCallback } from "react";
import { login } from "@/lib/actions/auth";
import { Button, Input, Label, Alert, Toast } from "@/components/ui";
import Link from "next/link";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  const clearToast = useCallback(() => setToast(null), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setToast(null);

    const formData = new FormData();
    formData.set("email", form.email);
    formData.set("password", form.password);

    const result = await login(formData);
    if (result?.error) {
      if (result.error.toLowerCase().includes("verify")) {
        setToast(result.error);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center px-4">
      <Toast message={toast} variant="warning" onClose={clearToast} />

      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="text-slate-500 text-sm mt-1">
            Sign in to your account
          </p>
        </div>

        {error && <Alert className="mb-6">{error}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="text-center mt-4">
          <Link href="/forgot-password" className="text-sm text-slate-400 hover:text-primary">
            Forgot your password?
          </Link>
        </div>

        <p className="text-center mt-4 text-sm text-slate-500">
          New player?{" "}
          <Link href="/register" className="text-primary font-semibold hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
