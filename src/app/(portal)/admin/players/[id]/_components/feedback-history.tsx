import { Card, EmptyState } from "@/components/ui";
import { MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import type { FeedbackRow } from "./types";

export function FeedbackHistory({ feedback }: { feedback: FeedbackRow[] }) {
  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-slate-400" />
        Coach Feedback
        {feedback.length > 0 && (
          <span className="text-xs font-normal text-slate-400">({feedback.length})</span>
        )}
      </h2>

      {feedback.length > 0 ? (
        <div className="space-y-3">
          {feedback.map((f) => (
            <div key={f.id} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5 gap-3">
                <span className="text-xs font-medium text-slate-700">
                  {f.coach ? `${f.coach.first_name} ${f.coach.last_name}` : "—"}
                </span>
                <span className="text-[11px] text-slate-400">
                  {formatDate(f.created_at)}
                </span>
              </div>
              {f.comment && (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{f.comment}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<MessageSquare className="w-8 h-8" />}
          title="No Feedback"
          description="No coach feedback for this player yet."
        />
      )}
    </Card>
  );
}
