import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Package } from "@/types/database";
import { CompleteProfileForm } from "./form";

export default async function CompleteProfilePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = await createClient() as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch active packages from DB
  const { data: packages } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true }) as { data: Package[] | null };

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* Mobile Hero */}
      <div className="lg:hidden bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-6">
        <div className="text-xs font-semibold tracking-widest uppercase text-cyan-400 mb-1">
          Almost There
        </div>
        <h2 className="text-xl font-bold text-white">
          Complete Your Profile
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Tell us about your training preferences so we can match you with the right group.
        </p>
      </div>

      {/* Desktop Left Panel */}
      <div className="hidden lg:flex w-[420px] bg-gradient-to-b from-slate-900 to-slate-800 p-10 flex-col justify-center text-white flex-shrink-0">
        <div className="text-xs font-semibold tracking-widest uppercase text-cyan-400 mb-3">
          Almost There
        </div>
        <h2 className="text-3xl font-extrabold leading-tight mb-4">
          Complete Your Profile
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed mb-8">
          Tell us about your training preferences so we can match you with the right group and coach.
        </p>
        <ul className="space-y-4 text-sm">
          {[
            { text: "Get matched to your level", icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" },
            { text: "Choose your training package", icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" },
            { text: "Set your training goals", icon: "M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z" },
            { text: "Start training immediately", icon: "M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" },
          ].map((item) => (
            <li key={item.text} className="flex items-center gap-3 text-slate-300">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d={item.icon} />
                </svg>
              </div>
              {item.text}
            </li>
          ))}
        </ul>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center p-6 sm:p-8 overflow-y-auto">
        <div className="w-full max-w-lg py-4 sm:py-10">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Training Details
          </h1>
          <p className="text-slate-500 text-sm mb-6">
            Help us personalize your experience by telling us about your training background.
          </p>

          <CompleteProfileForm packages={packages || []} />
        </div>
      </div>
    </div>
  );
}
