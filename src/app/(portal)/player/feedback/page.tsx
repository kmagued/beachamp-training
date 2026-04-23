import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayerFeedbackClient } from "./_components/player-feedback-client";

interface FeedbackFromCoachRow {
  id: string;
  comment: string | null;
  created_at: string;
  coach: { first_name: string; last_name: string } | null;
}

interface FeedbackToCoachRow {
  id: string;
  comment: string | null;
  rating: number | null;
  created_at: string;
  coach: { first_name: string; last_name: string } | null;
}

export default async function PlayerFeedbackPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const [{ data: fromCoach }, { data: toCoach }, { data: coaches }] = await Promise.all([
    supabase
      .from("feedback")
      .select("id, comment, created_at, coach:profiles!feedback_coach_id_fkey(first_name, last_name)")
      .eq("player_id", currentUser.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("coach_feedback")
      .select("id, comment, rating, created_at, coach:profiles!coach_feedback_coach_id_fkey(first_name, last_name)")
      .eq("player_id", currentUser.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("role", ["coach", "admin"])
      .eq("is_active", true)
      .order("first_name"),
  ]) as [
    { data: FeedbackFromCoachRow[] | null },
    { data: FeedbackToCoachRow[] | null },
    { data: { id: string; first_name: string; last_name: string }[] | null },
  ];

  return (
    <PlayerFeedbackClient
      fromCoach={fromCoach || []}
      toCoach={toCoach || []}
      coaches={coaches || []}
    />
  );
}
