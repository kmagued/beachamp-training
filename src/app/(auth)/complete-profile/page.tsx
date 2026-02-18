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

  const firstName = user.user_metadata?.first_name || "";

  // Fetch active packages from DB
  const { data: packages } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true }) as { data: Package[] | null };

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-full px-3 py-1 mb-4">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-primary text-xs font-semibold">Step 2 of 2</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
            {firstName ? `Welcome, ${firstName}!` : "Almost there!"}
          </h1>
          <p className="text-slate-500 text-sm sm:text-base max-w-md mx-auto">
            Help us personalize your training experience by telling us a bit more about you.
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8 max-w-xs mx-auto">
          <div className="flex-1 h-1.5 rounded-full bg-primary" />
          <div className="flex-1 h-1.5 rounded-full bg-primary/30" />
        </div>

        <CompleteProfileForm packages={packages || []} />
      </div>
    </div>
  );
}
