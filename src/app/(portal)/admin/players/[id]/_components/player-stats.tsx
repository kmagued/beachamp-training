import { StatCard } from "@/components/ui";
import { Package, Activity, CreditCard, ClipboardCheck, CalendarClock } from "lucide-react";
import type { SubscriptionRow } from "./types";

interface PlayerStatsProps {
  subsCount: number;
  activeSub: SubscriptionRow | undefined;
  totalPaid: number;
  totalSessions: number;
}

function getExpiryInfo(activeSub: SubscriptionRow | undefined) {
  if (!activeSub?.end_date) return { label: "Expires", value: "—", color: "bg-slate-300" };
  const daysLeft = Math.ceil((new Date(activeSub.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return { label: "Expires", value: "Expired", color: "bg-red-500" };
  if (daysLeft <= 3) return { label: "Expires In", value: `${daysLeft} day${daysLeft === 1 ? "" : "s"}`, color: "bg-red-500" };
  if (daysLeft <= 7) return { label: "Expires In", value: `${daysLeft} days`, color: "bg-amber-500" };
  return { label: "Expires", value: new Date(activeSub.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: "bg-slate-400" };
}

export function PlayerStats({ subsCount, activeSub, totalPaid, totalSessions }: PlayerStatsProps) {
  const sessionsColor = !activeSub ? "bg-slate-300" :
    activeSub.sessions_remaining <= 0 ? "bg-red-500" :
    activeSub.sessions_remaining <= 2 ? "bg-amber-500" : "bg-blue-500";
  const expiry = getExpiryInfo(activeSub);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
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
        accentColor={sessionsColor}
        icon={<Activity className="w-5 h-5" />}
      />
      <StatCard
        label={expiry.label}
        value={expiry.value}
        accentColor={expiry.color}
        icon={<CalendarClock className="w-5 h-5" />}
      />
      <StatCard
        label="Total Sessions"
        value={totalSessions}
        accentColor="bg-indigo-500"
        icon={<ClipboardCheck className="w-5 h-5" />}
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
