import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { MessageSquare, Calendar } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";

interface FeedbackRow {
  id: string;
  comment: string | null;
  created_at: string;
  coach: { first_name: string; last_name: string } | null;
}

export default async function PlayerFeedbackPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: feedback } = (await supabase
    .from("feedback")
    .select("id, comment, created_at, coach:profiles!feedback_coach_id_fkey(first_name, last_name)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false })) as { data: FeedbackRow[] | null };

  const records = feedback || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Feedback</h1>
        <p className="text-slate-500 text-sm">Feedback from your coaches</p>
      </div>

      {records.length > 0 ? (
        <div className="space-y-4">
          {records.map((fb) => (
            <Card key={fb.id}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-coach/10 flex items-center justify-center text-xs font-bold text-brand-coach flex-shrink-0">
                  {fb.coach?.first_name?.[0] || "C"}
                  {fb.coach?.last_name?.[0] || ""}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 mb-0.5">
                    {fb.coach?.first_name} {fb.coach?.last_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mb-2">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(fb.created_at)}
                    </span>
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
            description="Your coaches will share feedback with you here."
          />
        </Card>
      )}
    </div>
  );
}
