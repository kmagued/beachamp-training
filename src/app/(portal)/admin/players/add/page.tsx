"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { AddPlayerForm } from "./_components/add-player-form";
import { BulkImport } from "./_components/bulk-import";
import type { PackageOption } from "./_components/types";

const tabs = ["Add Player", "Bulk Import"] as const;
type Tab = (typeof tabs)[number];

export default function AddPlayersPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Add Player");
  const [packages, setPackages] = useState<PackageOption[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase
      .from("packages")
      .select("id, name, session_count, price, validity_days")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setPackages(data as PackageOption[]);
      });
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <Link
        href="/admin/players"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Players
      </Link>

      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Add Players</h1>
        <p className="text-slate-500 text-sm">Create player accounts</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              activeTab === tab
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Add Player" ? (
        <AddPlayerForm packages={packages} />
      ) : (
        <BulkImport />
      )}
    </div>
  );
}
