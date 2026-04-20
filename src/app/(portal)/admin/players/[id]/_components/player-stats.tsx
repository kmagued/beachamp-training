import { StatCard } from "@/components/ui";
import { Package, Activity, CreditCard, ClipboardCheck, CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import type { SubscriptionRow } from "./types";

interface PlayerStatsProps {
  subsCount: number;
  activeSubs: SubscriptionRow[];
  totalPaid: number;
  totalSessions: number;
}

function getExpiryInfo(activeSubs: SubscriptionRow[]) {
  if (activeSubs.length === 0 || !activeSubs.some((s) => s.end_date))
    return { label: "Expires", value: "—", color: "bg-primary-200" };
  // Use the latest end_date among all active subs
  const latestEnd = activeSubs
    .filter((s) => s.end_date)
    .sort((a, b) => new Date(b.end_date!).getTime() - new Date(a.end_date!).getTime())[0];
  if (!latestEnd?.end_date) return { label: "Expires", value: "—", color: "bg-primary-200" };
  const daysLeft = Math.ceil((new Date(latestEnd.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return { label: "Expires", value: "Expired", color: "bg-danger" };
  if (daysLeft <= 3) return { label: "Expires In", value: `${daysLeft} day${daysLeft === 1 ? "" : "s"}`, color: "bg-danger" };
  if (daysLeft <= 7) return { label: "Expires In", value: `${daysLeft} days`, color: "bg-accent" };
  return { label: "Expires", value: formatDate(latestEnd.end_date), color: "bg-secondary" };
}

export function PlayerStats({ subsCount, activeSubs, totalPaid, totalSessions }: PlayerStatsProps) {
  // Exclude single-session packages from package/sessions display
  const multiSessionSubs = activeSubs.filter((s) => s.sessions_total > 1);
  const totalRemaining = multiSessionSubs.reduce((sum, s) => sum + s.sessions_remaining, 0);
  const totalTotal = multiSessionSubs.reduce((sum, s) => sum + s.sessions_total, 0);
  const hasActive = multiSessionSubs.length > 0;
  const sessionsColor = !hasActive ? "bg-primary-200" :
    totalRemaining <= 0 ? "bg-danger" :
    totalRemaining <= 2 ? "bg-accent" : "bg-primary-800";
  const expiry = getExpiryInfo(multiSessionSubs);

  // Build active package display
  const activePackageValue = multiSessionSubs.length > 1
    ? multiSessionSubs.map((s) => s.packages?.name || "—").join(", ")
    : multiSessionSubs.length === 1
      ? multiSessionSubs[0].packages?.name || "None"
      : "None";

  // Build sessions display
  const sessionsValue = multiSessionSubs.length > 1
    ? multiSessionSubs.map((s) => `${s.sessions_remaining}`).join(" + ")
    : hasActive
      ? `${totalRemaining}/${totalTotal}`
      : "—";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
      <StatCard
        label="Subscriptions"
        value={subsCount}
        accentColor="bg-primary-800"
        icon={<Package className="w-5 h-5" />}
      />
      <StatCard
        label={activeSubs.length > 1 ? "Active Packages" : "Active Package"}
        value={activePackageValue}
        accentColor={hasActive ? "bg-success" : "bg-primary-200"}
        icon={<Package className="w-5 h-5" />}
      />
      <StatCard
        label="Sessions Left"
        value={sessionsValue}
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
        accentColor="bg-secondary-dark"
        icon={<ClipboardCheck className="w-5 h-5" />}
      />
      <StatCard
        label="Total Paid"
        value={`${totalPaid.toLocaleString()} EGP`}
        accentColor="bg-success"
        icon={<CreditCard className="w-5 h-5" />}
      />
    </div>
  );
}
