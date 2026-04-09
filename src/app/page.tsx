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
    <div className="min-h-screen bg-sand/10 text-primary-900">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden  min-h-[80vh] flex items-center">
        <Image
          src="/images/team-photo.jpg"
          alt="Beachamp Academy team training"
          fill
          priority
          sizes="100vw"
          className="object-cover -z-10"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary-900/90 via-primary-900/70 to-primary-900/40" />

        <div className="max-w-6xl mx-auto w-full px-6 py-24 sm:py-32">
          <div className="max-w-2xl text-white">
            <span className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Now accepting registrations
            </span>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Elevate your{" "}
              <span className="text-accent">{branding.sport.toLowerCase()}</span>{" "}
              game.
            </h1>
            <p className="mt-6 text-lg text-white/80 max-w-xl leading-relaxed">
              {branding.description}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {currentUser ? (
                <Link
                  href="/player/dashboard"
                  className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3 rounded-lg transition-colors"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3 rounded-lg transition-colors"
                >
                  Start Training Today
                </Link>
              )}
              <Link
                href="#packages"
                className="inline-flex items-center justify-center border border-white/40 hover:border-white text-white font-semibold px-7 py-3 rounded-lg transition-colors"
              >
                View Packages
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl sm:text-4xl font-bold text-primary-900">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-primary-700/60">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Programs ── */}
      <section className="">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary-900">
              What we offer
            </h2>
            <p className="mt-3 text-primary-700/70">
              Structured volleyball training designed to take your game to the
              next level, no matter where you&apos;re starting from.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {programs.map((program) => (
              <div key={program.title} className="bg-white rounded-2xl p-8 shadow-[0_4px_24px_-12px_rgba(18,75,93,0.08)]">
                <h3 className="text-lg font-semibold text-primary-900 mb-2">
                  {program.title}
                </h3>
                <p className="text-sm text-primary-700/70 leading-relaxed">
                  {program.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Levels ── */}
      <section className=" bg-sand/30">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary-900">
              Find your level
            </h2>
            <p className="mt-3 text-primary-700/70">
              We group players by skill level so you always train with the right
              intensity and competition.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {levels.map((level) => (
              <div
                key={level.name}
                className="bg-white rounded-2xl p-7 shadow-[0_4px_24px_-12px_rgba(18,75,93,0.08)]"
              >
                <h3 className="text-xl font-semibold text-primary-900">
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
            ))}
          </div>
        </div>
      </section>

      {/* ── Packages ── */}
      <section id="packages" className=" scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-primary-900">
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
                    "relative rounded-2xl p-6 bg-white shadow-[0_4px_24px_-12px_rgba(18,75,93,0.08)]",
                    isPopular && "ring-2 ring-primary-800"
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary-800 text-white text-[10px] font-semibold uppercase tracking-wider px-3 py-0.5 rounded-full">
                      Popular
                    </div>
                  )}
                  <div className="text-4xl font-bold text-primary-900">
                    {pkg.session_count}
                  </div>
                  <div className="mt-1 text-xs text-primary-700/60 uppercase tracking-wider">
                    {pkg.session_count === 1 ? "session" : "sessions"}
                  </div>
                  <div className="mt-5 text-2xl font-semibold text-primary-900">
                    {pkg.price.toLocaleString("en-US")}{" "}
                    <span className="text-sm font-medium text-primary-700/50">
                      EGP
                    </span>
                  </div>
                  {pkg.session_count > 1 && (
                    <div className="mt-1 text-xs text-secondary font-medium">
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
      <section className="bg-primary-800 text-white">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">
            Ready to hit the court?
          </h2>
          <p className="mt-4 text-white/70 max-w-lg mx-auto">
            Join our community of volleyball players. Register today, pick a
            package, and start improving your game.
          </p>
          <div className="mt-10">
            {currentUser ? (
              <Link
                href="/player/dashboard"
                className="inline-flex items-center justify-center bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3 rounded-lg transition-colors"
              >
                Go to Dashboard
              </Link>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center w-full sm:w-auto bg-accent hover:bg-accent-600 text-primary-900 font-semibold px-7 py-3 rounded-lg transition-colors"
                >
                  Join {branding.name}
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center w-full sm:w-auto border border-white/30 hover:border-white/60 text-white font-semibold px-7 py-3 rounded-lg transition-colors"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-sand/10">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/teal-logo.png"
              alt={branding.name}
              width={32}
              height={32}
              className="object-contain"
            />
            <span className="text-sm font-semibold text-primary-900">
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
