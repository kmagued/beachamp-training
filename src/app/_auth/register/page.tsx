"use client";

import { useState } from "react";
import Link from "next/link";
import { register } from "@/app/_auth/actions";

const areas = ["Maadi", "Zamalek", "New Cairo", "6th October", "Heliopolis", "Nasr City", "Mohandessin"];
const levels = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "professional", label: "Professional" },
];

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const password = formData.get("password") as string;
    const confirm = formData.get("confirm_password") as string;

    if (password !== confirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const result = await register(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left Panel */}
      <div className="hidden lg:flex w-[420px] bg-gradient-to-b from-blue-600 to-blue-500 p-10 flex-col justify-center text-white flex-shrink-0">
        <div className="text-xs font-semibold tracking-widest uppercase opacity-70 mb-3">
          Join the Academy
        </div>
        <h2 className="text-3xl font-extrabold leading-tight mb-4">
          Start Your Training Journey
        </h2>
        <p className="text-blue-100 text-sm leading-relaxed mb-8">
          Register to access your personal dashboard, track sessions, and
          connect with coaches.
        </p>
        <ul className="space-y-3 text-sm text-blue-50">
          {[
            "📊 Track your session balance",
            "💬 View coach feedback",
            "🔄 Renew packages online",
            "📅 See attendance history",
          ].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-xs">
              SA
            </div>
            <span className="text-slate-900 font-bold">Sports Academy</span>
          </Link>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Player Registration
          </h1>
          <p className="text-slate-500 text-sm mb-8">
            Fill in your details to create your account
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
              {error}
            </div>
          )}

          <form action={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  First Name
                </label>
                <input
                  type="text"
                  name="first_name"
                  required
                  placeholder="Ahmed"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Last Name
                </label>
                <input
                  type="text"
                  name="last_name"
                  required
                  placeholder="Hassan"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="ahmed@example.com"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Phone (WhatsApp)
              </label>
              <input
                type="tel"
                name="phone"
                required
                placeholder="+20 1XX XXX XXXX"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Area / Location
                </label>
                <select
                  name="area"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-700"
                >
                  <option value="">Select area...</option>
                  {areas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Playing Level
                </label>
                <select
                  name="playing_level"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-700"
                >
                  <option value="">Select level...</option>
                  {levels.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Training Goals
              </label>
              <input
                type="text"
                name="training_goals"
                placeholder="e.g., Improve backhand, competition prep..."
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  name="confirm_password"
                  required
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-2"
            >
              {loading ? "Creating account..." : "Register & Continue"}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-slate-500">
            Already registered?{" "}
            <Link
              href="/login"
              className="text-blue-500 font-semibold hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
