import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";
import { ArrowRight, Clock, Zap } from "lucide-react";
import type { Package } from "@/types/database";

export default async function PlayerPackagesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: packages } = await supabase
    .from("packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const pkgs = (packages || []) as Package[];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          Training Packages
        </h1>
        <p className="text-slate-500 text-sm">
          Choose a package that fits your training schedule.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pkgs.map((pkg) => (
          <Card key={pkg.id} className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900">{pkg.name}</h2>
              <Badge variant="info">{pkg.session_count} {pkg.session_count === 1 ? "session" : "sessions"}</Badge>
            </div>

            <div className="flex-1">
              <p className="text-2xl font-bold text-slate-900 mb-1">
                {pkg.price.toLocaleString("en-US")} <span className="text-sm font-medium text-slate-400">EGP</span>
              </p>

              <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  {pkg.session_count} {pkg.session_count === 1 ? "session" : "sessions"}
                </span>
                {pkg.validity_days > 1 && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {pkg.validity_days} days validity
                  </span>
                )}
              </div>

              {pkg.description && (
                <p className="text-sm text-slate-500 mt-3">{pkg.description}</p>
              )}
            </div>

            <Link
              href={`/player/subscribe?package=${pkg.id}`}
              className="mt-5 inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Subscribe
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Card>
        ))}
      </div>

      {pkgs.length === 0 && (
        <Card className="text-center py-10">
          <p className="text-sm text-slate-500">No packages available at the moment.</p>
        </Card>
      )}
    </div>
  );
}
