import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import type { PlayerProfile, SubscriptionRow, PaymentRow } from "./_components/types";
import { PlayerHeader } from "./_components/player-header";
import { ProfileCard } from "./_components/profile-cards";
import { PlayerStats } from "./_components/player-stats";
import { SubscriptionHistory } from "./_components/subscription-history";
import { PlaceholderSections } from "./_components/placeholder-sections";
import { PlayerActionsMenu } from "./_components/player-actions";

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const [{ data: profile }, { data: subscriptions }, { data: payments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, date_of_birth, area, playing_level, training_goals, health_conditions, is_active, created_at")
      .eq("id", id)
      .eq("role", "player")
      .single(),
    supabase
      .from("subscriptions")
      .select("id, status, sessions_remaining, sessions_total, start_date, end_date, created_at, packages(name, session_count, price)")
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("id, subscription_id, amount, method, status, created_at")
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!profile) notFound();

  const player = profile as PlayerProfile;
  const subs = (subscriptions || []) as SubscriptionRow[];
  const pays = (payments || []) as PaymentRow[];

  const paymentsBySub: Record<string, PaymentRow[]> = {};
  for (const p of pays) {
    if (!paymentsBySub[p.subscription_id]) paymentsBySub[p.subscription_id] = [];
    paymentsBySub[p.subscription_id].push(p);
  }

  const activeSub = subs.find((s) => s.status === "active");
  const totalPaid = pays.filter((p) => p.status === "confirmed").reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <Link
        href="/admin/players"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Players
      </Link>

      <PlayerHeader player={player} actions={<PlayerActionsMenu player={player} />} />
      <ProfileCard player={player} />
      <PlayerStats subsCount={subs.length} activeSub={activeSub} totalPaid={totalPaid} />
      <SubscriptionHistory subscriptions={subs} paymentsBySub={paymentsBySub} />
      <PlaceholderSections />
    </div>
  );
}
