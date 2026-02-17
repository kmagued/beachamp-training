import Link from "next/link";

const features = [
  {
    icon: "📊",
    title: "Player Dashboard",
    description:
      "Track sessions, view remaining balance, and monitor your training progress in real-time.",
  },
  {
    icon: "🏋️",
    title: "Coach Tools",
    description:
      "Log attendance, submit player feedback, and manage your training groups efficiently.",
  },
  {
    icon: "⚙️",
    title: "Admin Control",
    description:
      "Full oversight — manage players, packages, payments, coaches, and view financial reports.",
  },
  {
    icon: "📱",
    title: "WhatsApp Automation",
    description:
      "Automated welcome messages, feedback surveys, and renewal reminders via WhatsApp.",
  },
  {
    icon: "💳",
    title: "Payment Management",
    description:
      "Instapay, bank transfer, and cash — with screenshot upload and admin confirmation flow.",
  },
  {
    icon: "📈",
    title: "Reports & Analytics",
    description:
      "Attendance, revenue, active members, and renewal rate reports with filters and export.",
  },
];

const stats = [
  { value: "100+", label: "Active Players" },
  { value: "4", label: "Training Groups" },
  { value: "12", label: "Weekly Sessions" },
  { value: "3", label: "Expert Coaches" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
            SA
          </div>
          <span className="text-white font-bold text-lg">Sports Academy</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-slate-400 hover:text-white transition-colors text-sm font-medium px-4 py-2"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Register
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-8">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-blue-400 text-xs font-semibold tracking-wide uppercase">
            Now accepting registrations
          </span>
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold text-white leading-tight mb-6 max-w-3xl mx-auto">
          Your Training.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
            Digitized.
          </span>
        </h1>

        <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Player portals, coach tools, and admin dashboards — everything your
          sports academy needs to manage training, track progress, and grow.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/register"
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-blue-500/25 text-base"
          >
            Join as Player
          </Link>
          <Link
            href="/login"
            className="border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-medium px-8 py-3.5 rounded-xl transition-all text-base"
          >
            Sign In
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-20 max-w-3xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl font-extrabold text-white">
                {stat.value}
              </div>
              <div className="text-slate-500 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="h-px bg-gradient-to-r from-transparent via-slate-700 to-transparent max-w-4xl mx-auto" />

      {/* ── Features ── */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-white mb-4">
            Everything You Need
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Built for players, coaches, and administrators — each with their own
            tailored experience.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-slate-600/50 transition-colors group"
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-white font-semibold text-lg mb-2 group-hover:text-blue-400 transition-colors">
                {feature.title}
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Portals Preview ── */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              role: "Player",
              color: "blue",
              accent: "bg-blue-500",
              border: "border-blue-500/30",
              items: [
                "Session balance & validity",
                "Attendance history",
                "Coach feedback",
                "Package renewal",
              ],
            },
            {
              role: "Coach",
              color: "violet",
              accent: "bg-violet-500",
              border: "border-violet-500/30",
              items: [
                "Log attendance",
                "Submit player feedback",
                "View group rosters",
                "Session schedule",
              ],
            },
            {
              role: "Admin",
              color: "red",
              accent: "bg-red-500",
              border: "border-red-500/30",
              items: [
                "Player management",
                "Payment confirmation",
                "Financial reports",
                "Full system control",
              ],
            },
          ].map((portal) => (
            <div
              key={portal.role}
              className={`bg-slate-800/30 border ${portal.border} rounded-2xl p-6`}
            >
              <div className="flex items-center gap-3 mb-5">
                <div
                  className={`w-3 h-3 rounded-full ${portal.accent}`}
                />
                <h3 className="text-white font-semibold text-lg">
                  {portal.role} Portal
                </h3>
              </div>
              <ul className="space-y-3">
                {portal.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2.5 text-slate-400 text-sm"
                  >
                    <span className="text-emerald-400 text-xs">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-slate-400 mb-8">
            Register today and start tracking your training journey.
          </p>
          <Link
            href="/register"
            className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-blue-500/25"
          >
            Register Now
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/50 py-8 text-center">
        <p className="text-slate-600 text-sm">
          © 2026 Sports Academy. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
