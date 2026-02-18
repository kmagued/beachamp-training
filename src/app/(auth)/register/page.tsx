"use client";

import { useState } from "react";
import Link from "next/link";
import { register } from "@/lib/actions/auth";
import { branding } from "@/lib/config/branding";
import {
  Button,
  Input,
  Select,
  Label,
  Alert,
  DatePicker,
} from "@/components/ui";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    email: "",
    phone: "",
    area: "",
    password: "",
    confirm_password: "",
  });

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function validate(): string | null {
    if (!form.first_name.trim()) return "First name is required";
    if (!form.last_name.trim()) return "Last name is required";
    if (!form.date_of_birth) return "Date of birth is required";
    if (!form.email.trim()) return "Email is required";
    if (!form.phone.trim()) return "Phone number is required";
    const phone = form.phone.replace(/\s+/g, "");
    if (!/^(\+20|0)(1[0125])\d{8}$/.test(phone)) return "Enter a valid Egyptian phone number (e.g., 01XXXXXXXXX)";
    if (!form.area) return "Area of residence is required";
    if (!form.password) return "Password is required";
    if (form.password.length < 6) return "Password must be at least 6 characters";
    if (form.password !== form.confirm_password) return "Passwords do not match";
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
      if (key !== "confirm_password") {
        formData.set(key, value);
      }
    }

    const result = await register(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Mobile Hero (visible on small screens) */}
      <div className="lg:hidden bg-gradient-to-r from-sidebar to-secondary px-6 py-6">
        <div className="text-xs font-semibold tracking-widest uppercase text-primary-300 mb-1">
          Join Beachamp
        </div>
        <h2 className="text-xl font-bold text-white">
          Start Your Training Journey
        </h2>
        <p className="text-primary-200 text-sm mt-1">
          Register to track sessions, get feedback, and connect with coaches.
        </p>
      </div>

      {/* Desktop Left Panel */}
      <div className="hidden lg:flex w-[420px] bg-gradient-to-b from-sidebar to-secondary p-10 flex-col justify-center text-white flex-shrink-0">
        <div className="text-xs font-semibold tracking-widest uppercase text-primary-300 mb-3">
          Join Beachamp
        </div>
        <h2 className="text-3xl font-extrabold leading-tight mb-4">
          Start Your Training Journey
        </h2>
        <p className="text-primary-200 text-sm leading-relaxed mb-8">
          Register to access your personal dashboard, track sessions, and
          connect with coaches.
        </p>
        <ul className="space-y-4 text-sm">
          {[
            { text: "Track your session balance", icon: "M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" },
            { text: "View coach feedback", icon: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" },
            { text: "Renew packages online", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" },
            { text: "See attendance history", icon: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" },
          ].map((item) => (
            <li key={item.text} className="flex items-center gap-3 text-slate-300">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d={item.icon} />
                </svg>
              </div>
              {item.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center p-6 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-lg py-4 sm:py-10">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Create your account
          </h1>
          <p className="text-slate-500 text-sm mb-6">
            Fill in your details to get started. You&apos;ll complete your training
            profile after verifying your email.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label required>First Name</Label>
                <Input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => updateField("first_name", e.target.value)}
                  placeholder="Ahmed"
                />
              </div>
              <div>
                <Label required>Last Name</Label>
                <Input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => updateField("last_name", e.target.value)}
                  placeholder="Hassan"
                />
              </div>
            </div>

            <div>
              <Label required>Date of Birth</Label>
              <DatePicker
                value={form.date_of_birth}
                onChange={(e) => updateField("date_of_birth", e.target.value)}
              />
            </div>

            <div>
              <Label required>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="ahmed@example.com"
              />
            </div>

            <div>
              <Label required>Phone (WhatsApp)</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                placeholder="+20 1XX XXX XXXX"
              />
            </div>

            <div>
              <Label required>Area of Residence</Label>
              <Select
                value={form.area}
                onChange={(e) => updateField("area", e.target.value)}
              >
                <option value="">Select area...</option>
                {branding.areas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </Select>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <Label required>Password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="Min. 6 characters"
              />
            </div>

            <div>
              <Label required>Confirm Password</Label>
              <Input
                type="password"
                value={form.confirm_password}
                onChange={(e) => updateField("confirm_password", e.target.value)}
                placeholder="Re-enter password"
              />
            </div>

            {error && <Alert className="mt-2">{error}</Alert>}

            <Button type="submit" disabled={loading} fullWidth className="mt-2">
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <p className="text-center mt-6 text-sm text-slate-500">
            Already registered?{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
