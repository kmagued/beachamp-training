import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { Package } from "@/types/database";

const programs = [
  {
    title: "Beach Volleyball",
    description:
      "Specialized drills for serving, passing, setting, and hitting in 2v2 and 4v4 formats on the sand.",
  },
  {
    title: "Strength & Conditioning",
    description:
      "Explosive jumping, lateral agility, core stability, and injury prevention tailored for volleyball.",
  },
  {
    title: "Skills Development",
    description:
      "Focused technique sessions — ball control, footwork, game reading, and competitive match play.",
  },
  {
    title: "Group Training",
    description:
      "Train with players at your level. Small groups ensure personal attention and faster improvement.",
  },
  {
    title: "Progress Tracking",
    description:
      "Coach feedback after every session. Track attendance, improvement, and remaining sessions online.",
  },
  {
    title: "All Levels Welcome",
    description:
      "From beginners learning the basics to advanced players preparing for competition.",
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
    description: "New to volleyball or returning after a break.",
    includes: [
      "Fundamentals & technique",
      "Serving & passing basics",
      "Game rules & positioning",
      "Supportive environment",
    ],
  },
  {
    name: "Intermediate",
    description: "Comfortable with the basics, ready to level up.",
    includes: [
      "Advanced shot selection",
      "Defensive positioning",
      "Match strategy & tactics",
      "Competitive drills",
    ],
  },
  {
    name: "Advanced",
    description: "Experienced players training for competition.",
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
  const supabase = (await createClient()) as any;
  const currentUser = await getCurrentUser();

  const { data: dbPackages } = (await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })) as { data: Package[] | null };

  const packages = (dbPackages || []).map((p: Package) => ({
    session_count: p.session_count,
    validity_days: p.validity_days,
    price: p.price,
  }));

  return (
    <div className="min-h-screen bg-white text-primary-900">
      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-primary-100/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/images/logo.png"
              alt={branding.name}
              width={40}
              height={32}
              className="object-contain"
            />
            <span className="font-display text-xl tracking-wide text-primary-900 hidden sm:inline">
              {branding.name}
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <a
              href="#packages"
              className="hidden sm:inline-flex text-sm font-medium text-primary-800/80 hover:text-primary-900 px-3 py-2"
            >
              Packages
            </a>
            <a
              href="#programs"
              className="hidden sm:inline-flex text-sm font-medium text-primary-800/80 hover:text-primary-900 px-3 py-2"
            >
              Programs
            </a>
            {currentUser ? (
              <Link
                href="/player/dashboard"
                className="inline-flex items-center justify-center bg-primary-800 hover:bg-primary-900 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center text-sm font-semibold text-primary-900 hover:bg-primary-50 px-4 py-2 rounded-lg transition-colors"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Join now
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-sand/40">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.10] pointer-events-none"
          style={{
            backgroundImage: "url('/images/pattern.jpeg')",
            backgroundSize: "600px",
            backgroundRepeat: "repeat",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-sand/0 via-sand/10 to-white pointer-events-none" />
        <div
          aria-hidden
          className="absolute -top-40 -right-32 w-[480px] h-[480px] rounded-full bg-secondary/10 blur-3xl pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-accent/10 blur-3xl pointer-events-none"
        />

        <div className="relative max-w-6xl mx-auto px-6 py-20 sm:py-28 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 bg-white/80 backdrop-blur border border-primary-100 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-800">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Now accepting registrations
            </span>
            <h1 className="font-display mt-6 text-6xl sm:text-7xl lg:text-8xl tracking-tight leading-[0.95] text-primary-900">
              Elevate your
              <br />
              <span className="text-accent">{branding.sport.toLowerCase()}</span>{" "}
              game.
            </h1>
            <p className="mt-6 text-lg text-primary-800/70 max-w-xl leading-relaxed">
              {branding.description}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {currentUser ? (
                <Link
                  href="/player/dashboard"
                  className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3.5 rounded-lg transition-colors"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3.5 rounded-lg transition-colors shadow-sm"
                  >
                    Start Training Today
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center bg-white border border-primary-200 hover:border-primary-400 hover:bg-primary-50 text-primary-900 font-semibold px-7 py-3.5 rounded-lg transition-colors"
                  >
                    Log in to your account
                  </Link>
                </>
              )}
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs font-semibold uppercase tracking-wider text-primary-700/60">
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-secondary" />
                All skill levels
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-secondary" />
                Expert coaches
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-secondary" />
                Flexible packages
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-sm aspect-square">
              <div className="absolute inset-0 rounded-full bg-accent/10 blur-3xl" />
              <Image
                src="/images/logo.png"
                alt={`${branding.name} logo`}
                fill
                priority
                sizes="(max-width: 1024px) 80vw, 400px"
                className="object-contain relative"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-primary-100/60 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 sm:grid-cols-4 gap-8 divide-y sm:divide-y-0 sm:divide-x divide-primary-100/60">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="text-center px-4 pt-6 sm:pt-0 first:pt-0"
            >
              <div
                className={cn(
                  "font-display text-5xl sm:text-6xl leading-none",
                  i % 2 === 0 ? "text-primary-900" : "text-accent-600"
                )}
              >
                {stat.value}
              </div>
              <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-primary-700/60">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Programs ── */}
      <section id="programs" className="scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-600">
              What we offer
            </span>
            <h2 className="font-display mt-3 text-4xl sm:text-5xl tracking-tight text-primary-900">
              Training built around you
            </h2>
            <p className="mt-3 text-primary-700/70">
              Structured volleyball training designed to take your game to the
              next level, no matter where you&apos;re starting from.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {programs.map((program, i) => {
              const accentColors = [
                "bg-accent",
                "bg-secondary",
                "bg-primary-800",
              ];
              return (
                <div
                  key={program.title}
                  className="group relative bg-white border border-primary-100/70 rounded-2xl p-7 hover:border-primary-200 hover:shadow-[0_4px_24px_-12px_rgba(18,75,93,0.14)] transition-all"
                >
                  <div
                    className={cn(
                      "w-10 h-1 rounded-full mb-5",
                      accentColors[i % accentColors.length]
                    )}
                  />
                  <h3 className="font-display text-2xl tracking-wide text-primary-900 mb-2">
                    {program.title}
                  </h3>
                  <p className="text-sm text-primary-700/70 leading-relaxed">
                    {program.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Levels ── */}
      <section className="bg-sand/30">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-600">
              Every skill level
            </span>
            <h2 className="font-display mt-3 text-4xl sm:text-5xl tracking-tight text-primary-900">
              Find your level
            </h2>
            <p className="mt-3 text-primary-700/70">
              We group players by skill level so you always train with the right
              intensity and competition.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {levels.map((level, i) => {
              const badgeStyles = [
                "bg-secondary/15 text-primary-900",
                "bg-accent/20 text-primary-900",
                "bg-primary-800 text-white",
              ];
              return (
                <div
                  key={level.name}
                  className="bg-white rounded-2xl p-7 shadow-[0_4px_24px_-12px_rgba(18,75,93,0.08)] hover:shadow-[0_8px_32px_-12px_rgba(18,75,93,0.16)] transition-shadow"
                >
                  <span
                    className={cn(
                      "inline-flex text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full mb-4",
                      badgeStyles[i]
                    )}
                  >
                    Level {i + 1}
                  </span>
                  <h3 className="font-display text-3xl tracking-wide text-primary-900">
                    {level.name}
                  </h3>
                  <p className="mt-1 text-sm text-primary-700/60">
                    {level.description}
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {level.includes.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-sm text-primary-800"
                      >
                        <svg
                          className="w-4 h-4 mt-0.5 flex-shrink-0 text-secondary"
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
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Packages ── */}
      <section id="packages" className="scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-600">
              Pricing
            </span>
            <h2 className="font-display mt-3 text-4xl sm:text-5xl tracking-tight text-primary-900">
              Training packages
            </h2>
            <p className="mt-3 text-primary-700/70">
              Choose the package that fits your schedule. All packages include
              full access to group training sessions.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg) => {
              const isPopular = pkg.session_count === 12;
              const perSession =
                pkg.session_count > 0
                  ? Math.round(pkg.price / pkg.session_count)
                  : 0;
              return (
                <div
                  key={pkg.session_count}
                  className={cn(
                    "relative rounded-2xl p-6 bg-white shadow-[0_4px_24px_-12px_rgba(18,75,93,0.08)] transition-all hover:shadow-[0_8px_32px_-12px_rgba(18,75,93,0.18)]",
                    isPopular && "ring-2 ring-accent bg-gradient-to-br from-white to-accent/5"
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-accent text-primary-900 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-sm">
                      Popular
                    </div>
                  )}
                  <div
                    className={cn(
                      "font-display text-6xl leading-none",
                      isPopular ? "text-accent-600" : "text-primary-900"
                    )}
                  >
                    {pkg.session_count}
                  </div>
                  <div className="mt-2 text-xs text-primary-700/60 uppercase tracking-wider font-semibold">
                    {pkg.session_count === 1 ? "session" : "sessions"}
                  </div>
                  <div className="mt-5 text-2xl font-semibold text-primary-900">
                    {pkg.price.toLocaleString("en-US")}{" "}
                    <span className="text-sm font-medium text-primary-700/50">
                      EGP
                    </span>
                  </div>
                  {pkg.session_count > 1 && (
                    <div className="mt-1 text-xs text-secondary-dark font-semibold">
                      {perSession} EGP / session
                    </div>
                  )}
                  {pkg.validity_days > 1 && (
                    <div className="mt-2 text-[11px] text-primary-700/40">
                      Valid for {pkg.validity_days} days
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden bg-primary-900 text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: "url('/images/pattern.jpeg')",
            backgroundSize: "500px",
            backgroundRepeat: "repeat",
          }}
        />
        <div
          aria-hidden
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-secondary-dark/20 blur-3xl pointer-events-none"
        />
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="font-display text-5xl sm:text-6xl tracking-tight">
            Ready to hit the <span className="text-accent">court?</span>
          </h2>
          <p className="mt-4 text-white/70 max-w-lg mx-auto">
            Join our community of volleyball players. Register today, pick a
            package, and start improving your game.
          </p>
          <div className="mt-10">
            {currentUser ? (
              <Link
                href="/player/dashboard"
                className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3.5 rounded-lg transition-colors"
              >
                Go to Dashboard
              </Link>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center w-full sm:w-auto bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3.5 rounded-lg transition-colors"
                >
                  Join {branding.name}
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center w-full sm:w-auto border border-white/30 hover:border-white/60 text-white font-semibold px-7 py-3.5 rounded-lg transition-colors"
                >
                  Log in
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-primary-100/60">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/logo.png"
              alt={branding.name}
              width={36}
              height={28}
              className="object-contain"
            />
            <span className="font-display text-lg tracking-wide text-primary-900">
              {branding.name}
            </span>
          </div>
          <p className="text-xs text-primary-700/50">
            &copy; {new Date().getFullYear()} {branding.name}. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
