import Link from "next/link";
import { Logo } from "@/components/ui";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <Link href="/" className="inline-flex mb-8 justify-center">
          <Logo size="md" showName className="text-slate-900" />
        </Link>

        <div className="w-16 h-16 rounded-full bg-cyan-50 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Check your email
        </h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          We&apos;ve sent a verification link to your email address.
          Please click the link to verify your account before signing in.
        </p>

        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 text-left space-y-3 mb-8">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-slate-600">
              Check your inbox (and spam folder) for the verification email
            </p>
          </div>
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-slate-600">
              Click the link in the email to activate your account
            </p>
          </div>
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-slate-600">
              Once verified, sign in with your email and password
            </p>
          </div>
        </div>

        <Link
          href="/login"
          className="text-primary font-semibold text-sm hover:underline"
        >
          Go to Sign In
        </Link>
      </div>
    </div>
  );
}
