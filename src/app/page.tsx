import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import { Navbar, buttonVariants, buttonSizes } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { Package } from "@/types/database";

const programs = [
  {
    title: "Beach Volleyball",
    description:
      "Train on the sand with specialized drills for serving, passing, setting, and hitting in 2v2 and 4v4 formats.",
    iconPath:
      "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z",
  },
  {
    title: "Strength & Conditioning",
    description:
      "Volleyball-specific fitness — explosive jumping, lateral agility, core stability, and injury prevention.",
    iconPath:
      "M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14l1.43 1.43L5.57 7 4.14 5.57 2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14-1.43-1.43L18.43 17l1.43 1.43L22 16.29z",
  },
  {
    title: "Skills Development",
    description:
      "Focused sessions on technique — ball control, footwork, reading the game, and competitive match play.",
    iconPath:
      "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  },
  {
    title: "Group Training",
    description:
      "Train with players at your level. Small groups ensure personal attention and faster improvement.",
    iconPath:
      "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  },
  {
    title: "Progress Tracking",
    description:
      "Get coach feedback after every session. Track your attendance, improvement, and remaining sessions online.",
    iconPath:
      "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
  },
  {
    title: "All Levels Welcome",
    description:
      "From beginners learning the basics to advanced players preparing for competition — we have a group for you.",
    iconPath:
      "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
  },
];

const stats = [
  { value: "100+", label: "Active Players" },
  { value: "4", label: "Training Groups" },
  { value: "12", label: "Weekly Sessions" },
  { value: "3", label: "Expert Coaches" },
];

const levels = [
  {
    name: "Beginner",
    accent: "bg-emerald-500",
    accentText: "text-emerald-600",
    border: "border-emerald-200",
    description: "New to volleyball or returning after a break",
    includes: [
      "Fundamentals & technique",
      "Serving & passing basics",
      "Game rules & positioning",
      "Fun, supportive environment",
    ],
  },
  {
    name: "Intermediate",
    accent: "bg-primary",
    accentText: "text-primary",
    border: "border-primary-200",
    description: "Comfortable with basics, ready to level up",
    includes: [
      "Advanced shot selection",
      "Defensive positioning",
      "Match strategy & tactics",
      "Competitive drills",
    ],
  },
  {
    name: "Advanced",
    accent: "bg-violet-500",
    accentText: "text-violet-600",
    border: "border-violet-200",
    description: "Experienced players training for competition",
    includes: [
      "High-intensity match play",
      "Tournament preparation",
      "Video analysis & feedback",
      "Peak performance training",
    ],
  },
];

export default async function LandingPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;

  // Check if user is logged in
  const currentUser = await getCurrentUser();

  // Fetch packages from database
  const { data: dbPackages } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true }) as { data: Package[] | null };

  const packages = (dbPackages || []).map((p: Package) => ({
    session_count: p.session_count,
    validity_days: p.validity_days,
    price: p.price,
  }));

  return (
    <div className="min-h-screen bg-white">
      <Navbar
        user={
          currentUser
            ? { initials: currentUser.initials, email: currentUser.email }
            : null
        }
      />

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 sm:pt-24 pb-16 sm:pb-28">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-full px-3 sm:px-4 py-1.5 mb-6 sm:mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-primary-700 text-xs font-semibold tracking-wide uppercase">
              Now accepting registrations
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-tight mb-4 sm:mb-6">
            Elevate Your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-700 to-primary">
              {branding.sport} Game
            </span>
          </h1>

          <p className="text-slate-500 text-base sm:text-xl max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
            {branding.description}
          </p>

          {!currentUser && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Link
                href="/register"
                className={cn(
                  buttonVariants.primary,
                  buttonSizes.md,
                  "w-full sm:w-auto hover:shadow-lg hover:shadow-primary/20"
                )}
              >
                Start Training
              </Link>
              <Link
                href="/login"
                className={cn(
                  "border border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-900 font-medium transition-all",
                  buttonSizes.md,
                  "w-full sm:w-auto"
                )}
              >
                Sign In
              </Link>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 mt-16 sm:mt-20 max-w-3xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl sm:text-4xl font-extrabold text-primary">
                {stat.value}
              </div>
              <div className="text-slate-500 text-xs sm:text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent max-w-4xl mx-auto" />

      {/* ── What We Offer ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-28">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
            What We Offer
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-lg">
            Structured volleyball training designed to take your game to the
            next level, no matter where you&apos;re starting from.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {programs.map((program) => (
            <div
              key={program.title}
              className="bg-slate-50 border border-slate-100 rounded-2xl p-5 sm:p-6 hover:border-primary/30 hover:shadow-sm transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center mb-4">
                <svg
                  className="w-5 h-5 text-primary"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d={program.iconPath} />
                </svg>
              </div>
              <h3 className="text-slate-900 font-semibold text-base sm:text-lg mb-2 group-hover:text-primary transition-colors">
                {program.title}
              </h3>
              <p className="text-slate-500 text-sm leading-relaxed">
                {program.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Training Levels ── */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-28">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
              Find Your Level
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-lg">
              We group players by skill level so you always train with the right
              intensity and competition.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {levels.map((level) => (
              <div
                key={level.name}
                className={cn(
                  "bg-white border rounded-2xl p-5 sm:p-6",
                  level.border
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("w-3 h-3 rounded-full", level.accent)} />
                  <h3 className="text-slate-900 font-semibold text-base sm:text-lg">
                    {level.name}
                  </h3>
                </div>
                <p className="text-slate-500 text-sm mb-5">
                  {level.description}
                </p>
                <ul className="space-y-3">
                  {level.includes.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 text-slate-600 text-sm"
                    >
                      <svg
                        className={cn("w-4 h-4 flex-shrink-0", level.accentText)}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Packages ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-28">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mb-3 sm:mb-4">
            Training Packages
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-lg">
            Choose the package that fits your schedule. All packages include
            full access to group training sessions.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 max-w-5xl mx-auto">
          {packages.map((pkg) => (
            <div
              key={pkg.session_count}
              className={cn(
                "border rounded-2xl p-4 sm:p-6 text-center transition-all hover:shadow-md",
                pkg.session_count === 12
                  ? "border-primary bg-primary-50/50 ring-1 ring-primary/20"
                  : "border-slate-200 bg-white"
              )}
            >
              {pkg.session_count === 12 && (
                <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 sm:mb-3">
                  Most Popular
                </div>
              )}
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-1">
                {pkg.session_count}
              </div>
              <div className="text-slate-500 text-xs sm:text-sm mb-3 sm:mb-4">
                {pkg.session_count === 1 ? "session" : "sessions"}
              </div>
              <div className="text-lg sm:text-2xl font-bold text-slate-900 mb-1">
                {pkg.price.toLocaleString("en-US")} EGP
              </div>
              {pkg.validity_days > 1 && (
                <div className="text-slate-400 text-xs">
                  Valid for {pkg.validity_days} days
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-sidebar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
          <h2 className="text-xl sm:text-3xl font-bold text-white mb-3 sm:mb-4">
            Ready to hit the court?
          </h2>
          <p className="text-primary-200 text-sm sm:text-base mb-6 sm:mb-8 max-w-md mx-auto">
            Register today, pick a training package, and start improving your
            game.
          </p>
          {currentUser ? (
            <Link
              href="/player/dashboard"
              className="inline-block bg-primary hover:bg-primary-700 text-white font-semibold text-sm sm:text-base px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl transition-colors hover:shadow-lg hover:shadow-primary/25"
            >
              Go to Dashboard
            </Link>
          ) : (
            <Link
              href="/register"
              className="inline-block bg-primary hover:bg-primary-700 text-white font-semibold text-sm sm:text-base px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl transition-colors hover:shadow-lg hover:shadow-primary/25"
            >
              Join {branding.name}
            </Link>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100 py-6 sm:py-8 text-center">
        <p className="text-slate-400 text-xs sm:text-sm">
          &copy; {new Date().getFullYear()} {branding.name}. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}
