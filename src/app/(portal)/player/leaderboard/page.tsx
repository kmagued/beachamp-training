import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { loadLeaderboard, playerGroupIds } from "@/lib/king-of-court/load";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";

export default async function PlayerLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // Only the groups this player belongs to
  const sp = await searchParams;
  const data = await loadLeaderboard(
    typeof sp.month === "string" ? sp.month : undefined,
    await playerGroupIds(currentUser.id)
  );

  return (
    <LeaderboardView
      data={data}
      viewerId={currentUser.id}
      noGroups={{
        title: "You're not in a group yet",
        description: "Once you join a group, its King of Court leaderboard shows here.",
      }}
    />
  );
}
