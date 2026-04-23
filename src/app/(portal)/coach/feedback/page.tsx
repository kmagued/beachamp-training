import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { MessageSquare, Calendar, Star } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";

interface CoachFeedbackRow {
  id: string;
  comment: string | null;
  rating: number | null;
  created_at: string;
  player: { first_name: string; last_name: string } | null;
}

export default async function CoachFeedbackPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: feedback } = (await supabase
    .from("coach_feedback")
    .select("id, comment, rating, created_at, player:profiles!coach_feedback_player_id_fkey(first_name, last_name)")
    .eq("coach_id", currentUser.id)
    .order("created_at", { ascending: false })) as { data: CoachFeedbackRow[] | null };

  const records = feedback || [];
  const avgRating = (() => {
    const rated = records.filter((r) => r.rating != null);
    if (rated.length === 0) return null;
    return rated.reduce((s, r) => s + (r.rating || 0), 0) / rated.length;
  })();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Feedback</h1>
        <p className="text-slate-500 text-sm">Feedback from your players</p>
      </div>

      {avgRating != null && (
        <Card className="mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "w-5 h-5",
                    i < Math.round(avgRating) ? "fill-yellow-400 text-yellow-400" : "text-slate-300",
                  )}
                />
              ))}
            </div>
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{avgRating.toFixed(1)}</span> average rating
            </p>
          </div>
        </Card>
      )}

      {records.length > 0 ? (
        <div className="space-y-4">
          {records.map((fb) => (
            <Card key={fb.id}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {fb.player?.first_name?.[0] || "P"}
                  {fb.player?.last_name?.[0] || ""}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 mb-0.5">
                    {fb.player?.first_name} {fb.player?.last_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mb-2">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(fb.created_at)}
                    </span>
                    {fb.rating != null && (
                      <span className="inline-flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "w-3 h-3",
                              i < fb.rating! ? "fill-yellow-400 text-yellow-400" : "text-slate-300",
                            )}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  {fb.comment && (
                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {fb.comment}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<MessageSquare className="w-10 h-10" />}
            title="No Feedback Yet"
            description="Feedback from your players will appear here."
          />
        </Card>
      )}
    </div>
  );
}
