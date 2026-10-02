import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { BadgeIconKey, Measure } from "@/lib/badges/config";
import { BadgesClient, type AdminBadge } from "./_components/badges-client";

export default async function AdminBadgesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // player_badges(count) counts holders in the database: fetching the rows would hit
  // PostgREST's row limit once badges are widely held
  const { data, error } = await supabase
    .from("badges")
    .select("id, name, icon, measure, threshold, credits, counts_from, created_at, player_badges(count)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load badges: ${error.message}`);

  const rows = (data || []) as {
    id: string;
    name: string;
    icon: BadgeIconKey;
    measure: Measure;
    threshold: number;
    credits: number;
    counts_from: string;
    player_badges: { count: number }[];
  }[];

  const badges: AdminBadge[] = rows.map(({ player_badges, ...badge }) => ({
    ...badge,
    holders: player_badges[0]?.count ?? 0,
  }));

  return <BadgesClient badges={badges} />;
}
