"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Button } from "@/components/ui";
import { MessageSquare, Calendar, Plus, Star } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { NewCoachFeedbackDrawer } from "./new-coach-feedback-drawer";

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

type Tab = "received" | "sent";

interface CoachOption {
  id: string;
  first_name: string;
  last_name: string;
}

export function PlayerFeedbackClient({
  fromCoach,
  toCoach,
  coaches,
}: {
  fromCoach: FeedbackFromCoachRow[];
  toCoach: FeedbackToCoachRow[];
  coaches: CoachOption[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("received");
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Feedback</h1>
          <p className="text-slate-500 text-sm">Feedback between you and your coaches</p>
        </div>
        <Button onClick={() => setDrawerOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" /> Give Feedback
        </Button>
      </div>

      <div className="flex gap-2 mb-5 border-b border-slate-200">
        {(["received", "sent"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t === "received" ? `From coaches (${fromCoach.length})` : `Sent (${toCoach.length})`}
          </button>
        ))}
      </div>

      {tab === "received" && (
        <>
          {fromCoach.length > 0 ? (
            <div className="space-y-4">
              {fromCoach.map((fb) => (
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
        </>
      )}

      {tab === "sent" && (
        <>
          {toCoach.length > 0 ? (
            <div className="space-y-4">
              {toCoach.map((fb) => (
                <Card key={fb.id}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {fb.coach?.first_name?.[0] || "C"}
                      {fb.coach?.last_name?.[0] || ""}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 mb-0.5">
                        To: {fb.coach?.first_name} {fb.coach?.last_name}
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
                title="No Feedback Sent"
                description="Share your thoughts with your coaches using the button above."
              />
            </Card>
          )}
        </>
      )}

      <NewCoachFeedbackDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSuccess={() => router.refresh()}
        coaches={coaches}
      />
    </div>
  );
}
