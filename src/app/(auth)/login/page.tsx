"use client";

import { useState } from "react";
import Link from "next/link";
import { login } from "@/lib/actions/auth";
import { Button, Input, Label, Alert, Logo } from "@/components/ui";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex justify-center mb-6">
            <Logo />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="text-slate-500 text-sm mt-1">
            Sign in to your account
          </p>
        </div>

        {error && <Alert className="mb-6">{error}</Alert>}

        <form action={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" name="email" required placeholder="you@example.com" />
          </div>

          <div>
            <Label>Password</Label>
            <Input type="password" name="password" required placeholder="••••••••" />
          </div>

          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <p className="text-center mt-6 text-sm text-slate-500">
          New player?{" "}
          <Link href="/register" className="text-primary font-semibold hover:underline">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
