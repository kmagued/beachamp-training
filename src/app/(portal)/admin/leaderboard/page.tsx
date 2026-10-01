import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { loadLeaderboard } from "@/lib/king-of-court/load";
import { LeaderboardView } from "@/components/leaderboard/leaderboard-view";

export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  // The loader reads with the service role, so the page checks the role itself rather than
  // leaning on the layout (which lets anyone through in development)
  if (currentUser.profile.role !== "admin") redirect("/");

  const sp = await searchParams;
  const data = await loadLeaderboard(typeof sp.month === "string" ? sp.month : undefined, null);

  return (
    <LeaderboardView
      data={data}
      linkToDailyReport
      canClose
      noGroups={{
        title: "No groups yet",
        description: "Leaderboards appear here once groups exist and scores are logged from the Daily Report.",
      }}
    />
  );
}
