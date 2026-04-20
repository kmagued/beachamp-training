"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Alert } from "@/components/ui";
import { verifyEmailOtp, resendVerificationEmail } from "@/lib/actions/auth";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sand/10 flex items-center justify-center"><div className="animate-pulse text-primary-700/60">Loading...</div></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailFromParams = searchParams.get("email") || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleChange(index: number, value: string) {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError(null);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);

    // Focus last filled input or the next empty one
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  }

  async function handleVerify() {
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    if (!emailFromParams) {
      setError("Email address is missing. Please go back and register again.");
      return;
    }

    setVerifying(true);
    setError(null);

    const result = await verifyEmailOtp(emailFromParams, code);
    if (result?.error) {
      setError(result.error);
      setVerifying(false);
    }
    // If successful, the server action will redirect
  }

  async function handleResend() {
    if (!emailFromParams) {
      setError("Email address is missing");
      return;
    }
    setResending(true);
    setError(null);
    setResent(false);
    const result = await resendVerificationEmail(emailFromParams);
    if (result.error) {
      setError(result.error);
    } else {
      setResent(true);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
    setResending(false);
  }

  const isComplete = otp.every((d) => d !== "");

  return (
    <div className="min-h-screen bg-sand/10 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-primary-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="font-display text-5xl sm:text-6xl tracking-tight text-primary-900 mb-3">
          Verify your email
        </h1>
        <p className="text-primary-700/60 text-sm leading-relaxed mb-2">
          We&apos;ve sent a 6-digit verification code to
        </p>
        {emailFromParams && (
          <p className="text-sm font-semibold text-primary-900 mb-8">
            {emailFromParams}
          </p>
        )}

        {/* OTP Input */}
        <div className="flex justify-center gap-2 sm:gap-3 mb-6" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold border border-primary-200 rounded-lg focus:border-primary-800 focus:ring-2 focus:ring-primary-800/20 outline-none transition-all text-primary-900"
            />
          ))}
        </div>

        {error && <Alert className="mb-4 text-left">{error}</Alert>}

        <Button
          onClick={handleVerify}
          disabled={!isComplete || verifying}
          fullWidth
          className="mb-6"
        >
          {verifying ? "Verifying..." : "Verify Email"}
        </Button>

        {/* Resend */}
        <div className="border-t border-primary-100 pt-6">
          <p className="text-primary-700/60 text-sm mb-3">
            Didn&apos;t receive the code? Check your spam folder or
          </p>
          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="text-primary-800 font-semibold text-sm hover:text-primary-900 hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {resending ? "Sending..." : resent ? "Code sent!" : "Resend code"}
          </button>
          {resent && (
            <p className="text-emerald-600 text-xs mt-2">
              A new code has been sent to your email.
            </p>
          )}
        </div>

        <div className="mt-6">
          <Link
            href="/login"
            className="text-primary-800 text-sm hover:text-primary-900"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
