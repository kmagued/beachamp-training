"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { Upload, Clock, Loader2, ExternalLink } from "lucide-react";
import { INSTAPAY } from "@/lib/config/payment";
import { submitPendingPaymentScreenshot } from "../actions";

interface PendingPaymentCardProps {
  paymentId: string;
  packageName: string;
  amount: number;
  hasScreenshot: boolean;
}

export function PendingPaymentCard({ paymentId, packageName, amount, hasScreenshot }: PendingPaymentCardProps) {
  const [submitted, setSubmitted] = useState(hasScreenshot);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Revoke the previous object URL when it changes or the card unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type)) {
      setError("Please upload a PNG or JPG image");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }
    setError(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function handleSubmit() {
    if (!file) {
      setError("Please attach your payment screenshot");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("payment_id", paymentId);
    fd.set("screenshot", file);
    startTransition(async () => {
      const res = await submitPendingPaymentScreenshot(fd);
      if ("error" in res) {
        setError(res.error ?? "Failed to submit. Please try again.");
      } else {
        setFile(null);
        setPreviewUrl(null);
        setSubmitted(true);
      }
    });
  }

  // Awaiting-confirmation state
  if (submitted) {
    return (
      <div className="text-center py-4">
        <Badge variant="warning" className="mb-3">Awaiting Confirmation</Badge>
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
          <Clock className="w-6 h-6 text-amber-500" />
        </div>
        <p className="text-sm text-primary-700/70">
          We received your payment proof for <span className="font-semibold text-primary-900">{packageName}</span>. An admin will confirm it shortly.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="text-xs font-medium text-primary-700/60 hover:text-primary-900 mt-3"
        >
          Replace screenshot
        </button>
      </div>
    );
  }

  // Upload state
  return (
    <div className="space-y-3">
      <div className="text-center">
        <Badge variant="warning" className="mb-2">Payment Required</Badge>
        <p className="text-sm text-primary-700/70">
          Unpaid session for <span className="font-semibold text-primary-900">{packageName}</span>
        </p>
        <p className="text-2xl font-bold text-primary-900 mt-1">{amount.toLocaleString()} EGP</p>
      </div>

      <div className="rounded-xl bg-primary-50/60 border border-primary-200 px-4 py-3">
        <p className="text-xs font-medium text-slate-600 mb-0.5">Pay via Instapay to:</p>
        <p className="text-sm font-bold text-primary select-all">{INSTAPAY.handle}</p>
        <a
          href={INSTAPAY.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-1 hover:underline"
        >
          Open Instapay link <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-5 cursor-pointer hover:border-primary/50 transition-colors text-center">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Payment screenshot" className="max-h-28 rounded-lg object-contain mb-2" />
        ) : (
          <Upload className="w-7 h-7 text-slate-300 mb-1.5" />
        )}
        <p className="text-xs text-slate-500">{file ? file.name : "Upload payment screenshot"}</p>
        <p className="text-[11px] text-slate-400">PNG or JPG, up to 5MB</p>
        <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileChange} />
      </label>

      {error && <p className="text-xs text-red-600 text-center">{error}</p>}

      <Button fullWidth onClick={handleSubmit} disabled={isPending || !file}>
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
          </span>
        ) : (
          "Submit Payment Proof"
        )}
      </Button>
    </div>
  );
}
