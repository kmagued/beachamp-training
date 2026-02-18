"use client";

import { useState, useEffect, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Alert } from "@/components/ui";
import { Check, Upload, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { submitRenewal } from "./actions";
import type { Package, Subscription } from "@/types/database";

const paymentMethods = [
  { value: "instapay", label: "Instapay" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "vodafone_cash", label: "Vodafone Cash" },
] as const;

export default function PlayerRenewPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [activeSubscription, setActiveSubscription] = useState<(Subscription & { packages: Package }) | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function load() {
      const { data: pkgs } = await supabase
        .from("packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (pkgs) setPackages(pkgs as Package[]);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*, packages(*)")
          .eq("player_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sub) setActiveSubscription(sub as Subscription & { packages: Package });
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit() {
    if (!selectedPackage || !selectedMethod) return;

    const formData = new FormData();
    formData.set("package_id", selectedPackage);
    formData.set("method", selectedMethod);
    if (screenshot) formData.set("screenshot", screenshot);

    startTransition(async () => {
      const res = await submitRenewal(formData);
      setResult(res);
    });
  }

  if (result?.success) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto">
        <Card className="text-center py-10">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Request Submitted
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Your request has been submitted and is awaiting confirmation.
            You&apos;ll be notified once the admin confirms your payment.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          {activeSubscription ? "Renew Subscription" : "Choose a Package"}
        </h1>
        <p className="text-slate-500 text-sm">
          Select a training package and submit your payment.
        </p>
      </div>

      {result?.error && (
        <Alert variant="error" className="mb-4">{result.error}</Alert>
      )}

      {/* Current subscription info */}
      {activeSubscription && (
        <Card className="mb-6 bg-cyan-50/50 border-cyan-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">
                Current: {activeSubscription.packages.name}
              </p>
              <p className="text-xs text-slate-500">
                {activeSubscription.sessions_remaining} sessions remaining
                {activeSubscription.end_date &&
                  ` · Expires ${new Date(activeSubscription.end_date).toLocaleDateString()}`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Package selection */}
      <h2 className="font-semibold text-slate-900 mb-3">1. Choose Package</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => setSelectedPackage(pkg.id)}
            className={cn(
              "border rounded-xl p-4 text-left transition-all",
              selectedPackage === pkg.id
                ? "border-primary ring-2 ring-primary/20 bg-cyan-50/50"
                : "border-slate-200 bg-white hover:border-slate-300"
            )}
          >
            <p className="text-lg font-bold text-slate-900">{pkg.session_count}</p>
            <p className="text-xs text-slate-500 mb-2">
              {pkg.session_count === 1 ? "session" : "sessions"}
            </p>
            <p className="text-base font-bold text-slate-900">{pkg.price.toLocaleString()} EGP</p>
            {pkg.validity_days > 1 && (
              <p className="text-[11px] text-slate-400">{pkg.validity_days} days validity</p>
            )}
            {selectedPackage === pkg.id && (
              <div className="mt-2">
                <Badge variant="info">Selected</Badge>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Payment method */}
      <h2 className="font-semibold text-slate-900 mb-3">2. Payment Method</h2>
      <div className="flex flex-wrap gap-2 mb-8">
        {paymentMethods.map((m) => (
          <button
            key={m.value}
            onClick={() => setSelectedMethod(m.value)}
            className={cn(
              "px-4 py-2.5 rounded-lg border text-sm font-medium transition-all",
              selectedMethod === m.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Screenshot upload */}
      <h2 className="font-semibold text-slate-900 mb-3">3. Payment Screenshot</h2>
      <div className="mb-8">
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 cursor-pointer hover:border-primary/50 transition-colors">
          <Upload className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-500 mb-1">
            {screenshot ? screenshot.name : "Click to upload payment screenshot"}
          </p>
          <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
          />
        </label>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!selectedPackage || !selectedMethod || isPending}
        fullWidth
        size="md"
      >
        {isPending ? "Submitting..." : activeSubscription ? "Submit Renewal Request" : "Subscribe"}
      </Button>
    </div>
  );
}
