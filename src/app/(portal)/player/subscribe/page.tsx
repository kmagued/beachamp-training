"use client";

import { Suspense, useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Card, Badge, Button, Alert, Select, Textarea, MultiSelect, Skeleton } from "@/components/ui";
import { Check, Upload, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import { submitSubscription } from "./actions";
import type { Package, Subscription, Profile } from "@/types/database";

const paymentMethods = [
  { value: "instapay", label: "Instapay" },
] as const;

export default function PlayerSubscribePage() {
  return (
    <Suspense fallback={<SubscribePageSkeleton />}>
      <PlayerSubscribeContent />
    </Suspense>
  );
}

function SubscribePageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto p-6 sm:p-10 animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-48 mb-2" />
      <div className="h-4 bg-slate-100 rounded w-72 mb-8" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 bg-slate-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function PlayerSubscribeContent() {
  const searchParams = useSearchParams();
  const preselectedPackage = searchParams.get("package");

  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<Package[]>([]);
  const [activeSubscription, setActiveSubscription] = useState<(Subscription & { packages: Package }) | null>(null);
  const [needsTrainingInfo, setNeedsTrainingInfo] = useState(false);
  const [trainingInfo, setTrainingInfo] = useState({
    playing_level: "",
    training_goals: "",
    health_conditions: "",
  });
  const [selectedPackage, setSelectedPackage] = useState<string | null>(preselectedPackage);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
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
        // Check active subscription
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("*, packages(*)")
          .eq("player_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sub) setActiveSubscription(sub as Subscription & { packages: Package });

        // Check if training info is filled
        const { data: profile } = await supabase
          .from("profiles")
          .select("playing_level, training_goals, health_conditions")
          .eq("id", user.id)
          .single();

        if (profile) {
          const p = profile as Pick<Profile, "playing_level" | "training_goals" | "health_conditions">;
          if (!p.playing_level && !p.training_goals && !p.health_conditions) {
            setNeedsTrainingInfo(true);
          }
        }
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) {
      setScreenshot(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      setFileError("Only PNG and JPG files are allowed.");
      setScreenshot(null);
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File must be under 5MB.");
      setScreenshot(null);
      e.target.value = "";
      return;
    }
    setScreenshot(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleSubmit() {
    if (!selectedPackage || !selectedMethod || isPending) return;

    const formData = new FormData();
    formData.set("package_id", selectedPackage);
    formData.set("method", selectedMethod);
    if (screenshot) formData.set("screenshot", screenshot);

    // Include training info if needed
    if (needsTrainingInfo) {
      if (trainingInfo.playing_level) formData.set("playing_level", trainingInfo.playing_level);
      if (trainingInfo.training_goals) formData.set("training_goals", trainingInfo.training_goals);
      if (trainingInfo.health_conditions.trim()) formData.set("health_conditions", trainingInfo.health_conditions);
    }

    startTransition(async () => {
      const res = await submitSubscription(formData);
      setResult(res);
    });
  }

  if (result?.success) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <Card className="text-center py-10">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Subscription Request Submitted
          </h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Your subscription request has been submitted and is awaiting confirmation.
            You&apos;ll be notified once the admin confirms your payment.
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>

        {/* Package skeleton */}
        <Skeleton className="h-5 w-36 mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-slate-200 rounded-xl p-4">
              <Skeleton className="h-6 w-8 mb-1" />
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>

        {/* Payment method skeleton */}
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="flex gap-2 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-28 rounded-lg" />
          ))}
        </div>

        {/* Screenshot skeleton */}
        <Skeleton className="h-5 w-44 mb-3" />
        <Skeleton className="h-32 w-full rounded-xl mb-8" />

        {/* Button skeleton */}
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    );
  }

  // Step numbering adjusts based on whether training info is shown
  const trainingStep = 2;
  const methodStep = needsTrainingInfo ? 3 : 2;
  const screenshotStep = needsTrainingInfo ? 4 : 3;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          {activeSubscription ? "Renew Subscription" : "New Subscription"}
        </h1>
        <p className="text-slate-500 text-sm">
          {activeSubscription
            ? "Renew your training package to continue attending sessions."
            : "Choose a training package and submit your payment to get started."}
        </p>
      </div>

      {result?.error && (
        <Alert variant="error" className="mb-4">{result.error}</Alert>
      )}

      {/* Current subscription info */}
      {activeSubscription && (
        <Card className="mb-6 bg-primary-50/50 border-primary-200">
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
                ? "border-primary ring-2 ring-primary/20 bg-primary-50/50"
                : "border-slate-200 bg-white hover:border-slate-300"
            )}
          >
            <p className="text-lg font-bold text-slate-900">{pkg.session_count}</p>
            <p className="text-xs text-slate-500 mb-2">
              {pkg.session_count === 1 ? "session" : "sessions"}
            </p>
            <p className="text-base font-bold text-slate-900">{pkg.price.toLocaleString("en-US")} EGP</p>
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

      {/* Training info — shown only for first-time subscribers */}
      {needsTrainingInfo && (
        <>
          <h2 className="font-semibold text-slate-900 mb-3">{trainingStep}. Training Info</h2>
          <Card className="mb-8">
            <p className="text-xs text-slate-500 mb-4">
              Tell us about your experience so we can personalize your training.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Playing Level</label>
                <Select
                  value={trainingInfo.playing_level}
                  onChange={(e) => setTrainingInfo((prev) => ({ ...prev, playing_level: e.target.value }))}
                >
                  <option value="">Select level...</option>
                  {branding.levels.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Training Goals</label>
                <MultiSelect
                  options={branding.trainingGoals}
                  placeholder="Select your goals..."
                  value={trainingInfo.training_goals}
                  onChange={(value) => setTrainingInfo((prev) => ({ ...prev, training_goals: value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Health Conditions</label>
                <Textarea
                  value={trainingInfo.health_conditions}
                  onChange={(e) => setTrainingInfo((prev) => ({ ...prev, health_conditions: e.target.value }))}
                  placeholder="List any injuries, conditions, or write 'None'"
                  rows={2}
                />
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Payment method */}
      <h2 className="font-semibold text-slate-900 mb-3">{methodStep}. Payment Method</h2>
      <div className="flex flex-wrap gap-2 mb-4">
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

      {/* Instapay account info */}
      {selectedMethod === "instapay" && (
        <Card className="mb-8 bg-primary-50/50 border-primary-200">
          <p className="text-sm font-medium text-slate-900 mb-1">Send payment to:</p>
          <p className="text-base font-bold text-primary select-all">ahmed1.fahmy1@instapay</p>
          <a
            href="https://ipn.eg/S/ahmed1.fahmy1/instapay/7jMlOQ"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary font-medium mt-2 hover:underline"
          >
            Open Instapay Link
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
          </a>
        </Card>
      )}

      {!selectedMethod && <div className="mb-8" />}

      {/* Screenshot upload */}
      <h2 className="font-semibold text-slate-900 mb-3">{screenshotStep}. Payment Screenshot</h2>
      <div className="mb-8">
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-8 cursor-pointer hover:border-primary/50 transition-colors">
          {previewUrl ? (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Payment screenshot preview"
                className="max-h-32 rounded-lg object-contain mb-2"
              />
              <p className="text-sm text-slate-600 font-medium">{screenshot?.name}</p>
              <p className="text-xs text-slate-400 mt-1">Click to change</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500 mb-1">Click to upload payment screenshot</p>
              <p className="text-xs text-slate-400">PNG, JPG up to 5MB</p>
            </>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        {fileError && (
          <p className="text-xs text-red-500 mt-2">{fileError}</p>
        )}
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!selectedPackage || !selectedMethod || isPending}
        fullWidth
        size="md"
      >
        {isPending ? "Submitting..." : activeSubscription ? "Submit Renewal" : "Submit Subscription"}
      </Button>
    </div>
  );
}
