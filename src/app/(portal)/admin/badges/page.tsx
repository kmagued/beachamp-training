import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { BadgeIconKey, Measure, TierNumber } from "@/lib/badges/config";
import { BadgesClient, type AdminBadge } from "./_components/badges-client";

export default async function AdminBadgesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  // player_badges(count) counts each tier's holders in the database: fetching the rows
  // would hit PostgREST's row limit once badges are widely held. badge_summaries() gives
  // each badge's distinct holders and the credits actually paid, for the delete warning.
  const [{ data, error }, { data: summaries, error: summaryErr }] = await Promise.all([
    supabase
      .from("badges")
      .select("id, name, icon, measure, counts_from, created_at, badge_tiers(id, tier, threshold, credits, player_badges(count))")
      .order("created_at", { ascending: true }),
    supabase.rpc("badge_summaries"),
  ]);
  if (error) throw new Error(`Could not load badges: ${error.message}`);
  if (summaryErr) throw new Error(`Could not load badges: ${summaryErr.message}`);

  const summaryOf = new Map(
    ((summaries || []) as { badge_id: string; holders: number; credits_paid: number }[]).map((s) => [s.badge_id, s])
  );
  const rows = (data || []) as {
    id: string;
    name: string;
    icon: BadgeIconKey;
    measure: Measure;
    counts_from: string;
    badge_tiers: { id: string; tier: TierNumber; threshold: number; credits: number; player_badges: { count: number }[] }[];
  }[];

  const badges: AdminBadge[] = rows.map(({ badge_tiers, ...badge }) => ({
    ...badge,
    tiers: [...badge_tiers]
      .sort((a, b) => a.tier - b.tier)
      .map(({ player_badges, ...tier }) => ({ ...tier, holders: player_badges[0]?.count ?? 0 })),
    holders: summaryOf.get(badge.id)?.holders ?? 0,
    credits_paid: summaryOf.get(badge.id)?.credits_paid ?? 0,
  }));

  return <BadgesClient badges={badges} />;
}
