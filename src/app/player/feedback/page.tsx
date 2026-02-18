import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { MessageSquare, Star } from "lucide-react";

interface FeedbackRow {
  id: string;
  session_date: string;
  rating: number;
  comment: string | null;
  created_at: string;
  coach: { first_name: string; last_name: string } | null;
}

export default async function PlayerFeedbackPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any;

  const { data: feedback } = await supabase
    .from("feedback")
    .select("*, coach:profiles!feedback_coach_id_fkey(first_name, last_name)")
    .eq("player_id", currentUser.id)
    .order("created_at", { ascending: false }) as { data: FeedbackRow[] | null };

  const records = feedback || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Feedback</h1>
        <p className="text-slate-500 text-sm">Coach feedback from your training sessions</p>
      </div>

      {records.length > 0 ? (
        <div className="space-y-4">
          {records.map((fb) => (
            <Card key={fb.id}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-coach/10 flex items-center justify-center text-xs font-bold text-brand-coach flex-shrink-0">
                  {(fb.coach?.first_name?.[0] || "C")}
                  {(fb.coach?.last_name?.[0] || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-900">
                      {fb.coach?.first_name} {fb.coach?.last_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(fb.session_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < fb.rating
                            ? "text-amber-400 fill-amber-400"
                            : "text-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                  {fb.comment && (
                    <p className="text-sm text-slate-600 leading-relaxed">
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
            description="Your coaches will leave feedback after your training sessions."
          />
        </Card>
      )}
    </div>
  );
}
