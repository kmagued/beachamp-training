import Link from "next/link";
import Image from "next/image";
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
      "Specialized drills for serving, passing, setting, and hitting in 2v2 and 4v4 formats on the sand.",
    icon: "🏐",
  },
  {
    title: "Strength & Conditioning",
    description:
      "Explosive jumping, lateral agility, core stability, and injury prevention tailored for volleyball.",
    icon: "💪",
  },
  {
    title: "Skills Development",
    description:
      "Focused technique sessions — ball control, footwork, game reading, and competitive match play.",
    icon: "🎯",
  },
  {
    title: "Group Training",
    description:
      "Train with players at your level. Small groups ensure personal attention and faster improvement.",
    icon: "👥",
  },
  {
    title: "Progress Tracking",
    description:
      "Coach feedback after every session. Track attendance, improvement, and remaining sessions online.",
    icon: "📊",
  },
  {
    title: "All Levels Welcome",
    description:
      "From beginners learning the basics to advanced players preparing for competition.",
    icon: "⭐",
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
    accentLight: "bg-emerald-50",
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
    accentLight: "bg-primary-50",
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
    accentLight: "bg-violet-50",
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
  const currentUser = await getCurrentUser();

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
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-primary-50/80 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gradient-to-tl from-accent-50/50 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: Text content */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-200 rounded-full px-3 sm:px-4 py-1.5 mb-6 sm:mb-8">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-primary-700 text-xs font-semibold tracking-wide uppercase">
                  Now accepting registrations
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.1] mb-5 sm:mb-6">
                Elevate Your{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-700 via-primary to-primary-400">
                  {branding.sport} Game
                </span>
              </h1>

              <p className="text-slate-500 text-base sm:text-xl max-w-xl mx-auto lg:mx-0 mb-8 sm:mb-10 leading-relaxed">
                {branding.description}
              </p>

              {!currentUser && (
                <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 sm:gap-4">
                  <Link
                    href="/register"
                    className={cn(
                      buttonVariants.primary,
                      buttonSizes.md,
                      "w-full sm:w-auto hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all"
                    )}
                  >
                    Start Training Today
                  </Link>
                  <Link
                    href="#packages"
                    className={cn(
                      "border border-slate-300 hover:border-slate-400 text-slate-700 hover:text-slate-900 font-medium transition-all rounded-xl",
                      buttonSizes.md,
                      "w-full sm:w-auto"
                    )}
                  >
                    View Packages
                  </Link>
                </div>
              )}
            </div>

            {/* Right: Hero image placeholder */}
            <div className="relative hidden lg:block">
              <div className="aspect-[4/3] rounded-2xl border border-slate-200 overflow-hidden relative">
                <Image
                  src="/team-photo.jpg"
                  alt="Beachamp Academy team"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              {/* Floating stat card */}
              <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg border border-slate-100 px-4 py-3">
                <div className="text-2xl font-extrabold text-primary">100+</div>
                <div className="text-slate-500 text-xs">Active Players</div>
              </div>
              {/* Floating badge */}
              <div className="absolute -top-2 -right-2 bg-white rounded-xl shadow-lg border border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold text-slate-700">Sessions Running</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mt-16 sm:mt-20">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-6 text-center hover:border-primary/20 hover:shadow-sm transition-all">
                <div className="text-3xl sm:text-4xl font-extrabold text-primary mb-1">
                  {stat.value}
                </div>
                <div className="text-slate-500 text-xs sm:text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What We Offer ── */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-10 sm:mb-14">
            <span className="text-primary text-xs font-bold uppercase tracking-widest">Programs</span>
            <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2 mb-3 sm:mb-4">
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
                className="bg-white border border-slate-100 rounded-2xl p-5 sm:p-6 hover:border-primary/30 hover:shadow-md hover:-translate-y-1 transition-all group"
              >
                <div className="text-3xl mb-4">{program.icon}</div>
                <h3 className="text-slate-900 font-semibold text-base sm:text-lg mb-2 group-hover:text-primary transition-colors">
                  {program.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {program.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery / Action Shots ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-10 sm:mb-14">
          <span className="text-primary text-xs font-bold uppercase tracking-widest">Gallery</span>
          <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2 mb-3 sm:mb-4">
            Life at {branding.name}
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-lg">
            A glimpse into our training sessions, matches, and community.
          </p>
        </div>

        {/* Image grid with placeholders */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Training Session", span: "sm:col-span-2 sm:row-span-2", aspect: "aspect-[4/3] sm:aspect-square" },
            { label: "Team Huddle", span: "", aspect: "aspect-square" },
            { label: "Match Day", span: "", aspect: "aspect-square" },
            { label: "Coaching", span: "", aspect: "aspect-[4/3]" },
            { label: "Awards", span: "", aspect: "aspect-[4/3]" },
            { label: "Practice", span: "", aspect: "aspect-[4/3]" },
          ].map((img, i) => (
            <div
              key={i}
              className={cn(
                "rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center group hover:border-primary/30 transition-all",
                img.aspect,
                img.span,
              )}
            >
              <div className="text-center">
                <div className="text-2xl sm:text-3xl mb-1 opacity-40 group-hover:opacity-60 transition-opacity">📸</div>
                <p className="text-slate-300 text-[10px] sm:text-xs font-medium">{img.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Training Levels ── */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-10 sm:mb-14">
            <span className="text-primary text-xs font-bold uppercase tracking-widest">Levels</span>
            <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2 mb-3 sm:mb-4">
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
                  "bg-white border rounded-2xl p-5 sm:p-6 hover:shadow-md hover:-translate-y-1 transition-all",
                  level.border
                )}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", level.accentLight)}>
                    <div className={cn("w-3 h-3 rounded-full", level.accent)} />
                  </div>
                  <div>
                    <h3 className="text-slate-900 font-semibold text-base sm:text-lg">
                      {level.name}
                    </h3>
                    <p className="text-slate-400 text-xs">{level.description}</p>
                  </div>
                </div>
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
      <section id="packages" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 scroll-mt-20">
        <div className="text-center mb-10 sm:mb-14">
          <span className="text-primary text-xs font-bold uppercase tracking-widest">Pricing</span>
          <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mt-2 mb-3 sm:mb-4">
            Training Packages
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-lg">
            Choose the package that fits your schedule. All packages include
            full access to group training sessions.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 max-w-5xl mx-auto">
          {packages.map((pkg) => {
            const isPopular = pkg.session_count === 12;
            const perSession = pkg.session_count > 0 ? Math.round(pkg.price / pkg.session_count) : 0;
            return (
              <div
                key={pkg.session_count}
                className={cn(
                  "relative border rounded-2xl p-4 sm:p-6 text-center transition-all hover:shadow-lg hover:-translate-y-1",
                  isPopular
                    ? "border-primary bg-gradient-to-b from-primary-50 to-white ring-2 ring-primary/20"
                    : "border-slate-200 bg-white hover:border-primary/30"
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] sm:text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-1 mt-1">
                  {pkg.session_count}
                </div>
                <div className="text-slate-500 text-xs sm:text-sm mb-4 sm:mb-5">
                  {pkg.session_count === 1 ? "session" : "sessions"}
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
                  {pkg.price.toLocaleString("en-US")} <span className="text-sm font-medium text-slate-400">EGP</span>
                </div>
                {pkg.session_count > 1 && (
                  <div className="text-primary text-xs font-medium mb-2">
                    {perSession} EGP / session
                  </div>
                )}
                {pkg.validity_days > 1 && (
                  <div className="text-slate-400 text-[11px]">
                    Valid for {pkg.validity_days} days
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!currentUser && (
          <div className="text-center mt-8 sm:mt-10">
            <Link
              href="/register"
              className={cn(
                buttonVariants.primary,
                buttonSizes.md,
                "hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 transition-all"
              )}
            >
              Get Started
            </Link>
          </div>
        )}
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden bg-sidebar">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-3 sm:mb-4">
              Ready to Hit the Court?
            </h2>
            <p className="text-primary-200 text-sm sm:text-lg mb-8 sm:mb-10 max-w-lg mx-auto leading-relaxed">
              Join our community of volleyball players. Register today, pick a training package, and start improving your game.
            </p>
            {currentUser ? (
              <Link
                href="/player/dashboard"
                className="inline-block bg-primary hover:bg-primary-400 text-white font-semibold text-sm sm:text-base px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl transition-all hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5"
              >
                Go to Dashboard
              </Link>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                <Link
                  href="/register"
                  className="inline-block bg-primary hover:bg-primary-400 text-white font-semibold text-sm sm:text-base px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl transition-all hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5 w-full sm:w-auto"
                >
                  Join {branding.name}
                </Link>
                <Link
                  href="/login"
                  className="inline-block border border-white/20 hover:border-white/40 text-white font-medium text-sm sm:text-base px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl transition-all w-full sm:w-auto"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-900">{branding.name}</p>
              <p className="text-slate-400 text-xs mt-0.5">Professional volleyball training for all levels</p>
            </div>
            <p className="text-slate-400 text-xs">
              &copy; {new Date().getFullYear()} {branding.name}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
