import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SessionDetail } from "@/components/coach/SessionDetail";
import { coachGroupIds } from "@/lib/king-of-court/load";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CoachSessionDetailPage({ params }: PageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { id } = await params;

  // Scores for the groups this coach is assigned to, whoever is asking (as on the coach
  // Leaderboard). If they can't be loaded the page still opens, without the Scores tab.
  let scorerGroupIds: string[] = [];
  try {
    scorerGroupIds = [...(await coachGroupIds(currentUser.id))];
  } catch (err) {
    console.error("[coach session] could not load the coach's groups:", err);
  }

  return (
    <SessionDetail
      scheduleSessionId={id}
      basePath="/coach"
      scorerGroupIds={scorerGroupIds}
    />
  );
}
