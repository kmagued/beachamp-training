"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
    gender: "",
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
    <div className="min-h-screen bg-sand/10 text-primary-900">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block mb-6">
            <Image
              src="/images/logo.png"
              alt={branding.name}
              width={200}
              height={84}
              priority
              className="h-24 w-auto object-contain mx-auto"
            />
          </Link>
          <h1 className="font-display text-5xl sm:text-6xl tracking-tight text-primary-900">
            Create your account
          </h1>
          <p className="text-primary-700/60 text-sm sm:text-base mt-2 max-w-md mx-auto">
            Fill in your details to get started. You&apos;ll complete your
            training profile after verifying your email.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-[0_8px_40px_-20px_rgba(18,75,93,0.15)]">

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label required>Date of Birth</Label>
                <DatePicker
                  value={form.date_of_birth}
                  onChange={(e) => updateField("date_of_birth", e.target.value)}
                />
              </div>
              <div>
                <Label>Gender</Label>
                <Select
                  value={form.gender}
                  onChange={(e) => updateField("gender", e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </Select>
              </div>
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
              <Input
                type="text"
                value={form.area}
                onChange={(e) => updateField("area", e.target.value)}
                placeholder="e.g. Maadi, New Cairo"
                list="area-suggestions-register"
              />
              <datalist id="area-suggestions-register">
                {branding.areas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>

            <div className="pt-2">
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
        </div>

        <p className="text-center mt-6 text-sm text-primary-700/60">
          Already registered?{" "}
          <Link href="/login" className="text-primary-800 font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
