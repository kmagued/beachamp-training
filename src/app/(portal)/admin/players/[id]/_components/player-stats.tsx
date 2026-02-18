import { StatCard } from "@/components/ui";
import { Package, Activity, CreditCard } from "lucide-react";
import type { SubscriptionRow } from "./types";

interface PlayerStatsProps {
  subsCount: number;
  activeSub: SubscriptionRow | undefined;
  totalPaid: number;
}

export function PlayerStats({ subsCount, activeSub, totalPaid }: PlayerStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      <StatCard
        label="Subscriptions"
        value={subsCount}
        accentColor="bg-primary"
        icon={<Package className="w-5 h-5" />}
      />
      <StatCard
        label="Active Package"
        value={activeSub?.packages?.name || "None"}
        accentColor={activeSub ? "bg-emerald-500" : "bg-slate-300"}
        icon={<Package className="w-5 h-5" />}
      />
      <StatCard
        label="Sessions Left"
        value={activeSub ? `${activeSub.sessions_remaining}/${activeSub.sessions_total}` : "—"}
        accentColor={activeSub ? "bg-blue-500" : "bg-slate-300"}
        icon={<Activity className="w-5 h-5" />}
      />
      <StatCard
        label="Total Paid"
        value={`${totalPaid.toLocaleString()} EGP`}
        accentColor="bg-emerald-500"
        icon={<CreditCard className="w-5 h-5" />}
      />
    </div>
  );
}
