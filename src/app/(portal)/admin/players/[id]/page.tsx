import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import type { PlayerProfile, SubscriptionRow, PaymentRow, AttendanceRow, FeedbackRow } from "./_components/types";
import { PlayerHeader } from "./_components/player-header";
import { ProfileCard } from "./_components/profile-cards";
import { PlayerStats } from "./_components/player-stats";
import { SubscriptionHistory } from "./_components/subscription-history";
import { SessionHistory } from "./_components/session-history";
import { PlayerActionsMenu } from "./_components/player-actions";

export default async function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const [
    { data: profile },
    { data: subscriptions },
    { data: payments },
    { data: attendance },
    { data: feedback },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, phone, date_of_birth, area, gender, playing_level, training_goals, health_conditions, height, weight, preferred_hand, preferred_position, guardian_name, guardian_phone, is_active, created_at")
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
    supabase
      .from("attendance")
      .select("id, session_date, session_time, status, notes, created_at, groups!attendance_group_id_fkey(name), profiles!attendance_marked_by_fkey(first_name, last_name)")
      .eq("player_id", id)
      .order("session_date", { ascending: false })
      .limit(50),
    supabase
      .from("feedback")
      .select("id, session_date, rating, comment, created_at, profiles!feedback_coach_id_fkey(first_name, last_name)")
      .eq("player_id", id)
      .order("session_date", { ascending: false })
      .limit(50),
  ]);

  if (!profile) notFound();

  const player = profile as PlayerProfile;
  const subs = (subscriptions || []) as SubscriptionRow[];
  const pays = (payments || []) as PaymentRow[];
  const attendanceRows = ((attendance || []) as { id: string; session_date: string; session_time: string | null; status: string; notes: string | null; created_at: string; groups: { name: string } | null; profiles: { first_name: string; last_name: string } | null }[]).map((a) => ({
    id: a.id,
    session_date: a.session_date,
    session_time: a.session_time,
    status: a.status,
    notes: a.notes,
    created_at: a.created_at,
    group: a.groups,
    marked_by_profile: a.profiles,
  })) as AttendanceRow[];
  const feedbackRows = ((feedback || []) as { id: string; session_date: string; rating: number; comment: string | null; created_at: string; profiles: { first_name: string; last_name: string } | null }[]).map((f) => ({
    id: f.id,
    session_date: f.session_date,
    rating: f.rating,
    comment: f.comment,
    created_at: f.created_at,
    coach: f.profiles,
  })) as FeedbackRow[];

  const paymentsBySub: Record<string, PaymentRow[]> = {};
  for (const p of pays) {
    if (!paymentsBySub[p.subscription_id]) paymentsBySub[p.subscription_id] = [];
    paymentsBySub[p.subscription_id].push(p);
  }

  const activeSubs = subs.filter((s) => (s.status === "active" || s.status === "pending") && s.sessions_remaining > 0 && (!s.end_date || new Date(s.end_date).getTime() >= Date.now()));
  const totalPaid = pays.filter((p) => p.status === "confirmed").reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <Link
        href="/admin/players"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700/60 hover:text-primary-900 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Players
      </Link>

      <PlayerHeader player={player} hasActiveSubscription={activeSubs.length > 0} actions={<PlayerActionsMenu player={player} />} />
      <ProfileCard player={player} />
      <PlayerStats subsCount={subs.length} activeSubs={activeSubs} totalPaid={totalPaid} totalSessions={attendanceRows.length} />
      <SubscriptionHistory subscriptions={subs} paymentsBySub={paymentsBySub} playerId={id} playerName={`${player.first_name} ${player.last_name}`} />
      <SessionHistory attendance={attendanceRows} feedback={feedbackRows} />
    </div>
  );
}
