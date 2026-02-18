"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, Label, Alert } from "@/components/ui";
import { sendPasswordReset } from "@/lib/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await sendPasswordReset(email);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setSent(true);
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-2">
            We&apos;ve sent a 6-digit reset code to
          </p>
          <p className="text-sm font-semibold text-slate-900 mb-8">{email}</p>

          <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
            <Button fullWidth>Enter Reset Code</Button>
          </Link>

          <div className="mt-6">
            <Link href="/login" className="text-slate-400 text-sm hover:text-slate-600">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Forgot Password</h1>
          <p className="text-slate-500 text-sm mt-1">
            Enter your email and we&apos;ll send you a reset code
          </p>
        </div>

        {error && <Alert className="mb-6">{error}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <Button type="submit" disabled={loading || !email} fullWidth>
            {loading ? "Sending..." : "Send Reset Code"}
          </Button>
        </form>

        <p className="text-center mt-6 text-sm text-slate-500">
          Remember your password?{" "}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
