import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bg px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-slate-200">404</p>
        <h1 className="text-xl font-semibold text-slate-900 mt-4">Page Not Found</h1>
        <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 text-sm font-medium text-primary hover:underline"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
