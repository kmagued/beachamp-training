import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { coachGroupIds, loadLeaderboard } from "@/lib/king-of-court/load";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";

export default async function CoachLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // Only the groups this coach is assigned to, whoever is asking
  const sp = await searchParams;
  const data = await loadLeaderboard(
    typeof sp.month === "string" ? sp.month : undefined,
    await coachGroupIds(currentUser.id)
  );

  return (
    <LeaderboardView
      data={data}
      noGroups={{
        title: "No groups to show",
        description: "The leaderboard shows the groups you coach.",
      }}
    />
  );
}
