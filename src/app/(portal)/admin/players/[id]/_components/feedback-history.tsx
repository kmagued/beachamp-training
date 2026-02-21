import { Card, EmptyState } from "@/components/ui";
import { MessageSquare, Star } from "lucide-react";
import type { FeedbackRow } from "./types";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
        />
      ))}
    </div>
  );
}

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
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Date</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Coach</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Rating</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Comment</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-medium text-slate-900">
                      {new Date(f.session_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-3 text-slate-700">
                      {f.coach ? `${f.coach.first_name} ${f.coach.last_name}` : "—"}
                    </td>
                    <td className="py-3"><StarRating rating={f.rating} /></td>
                    <td className="py-3 text-slate-600 text-sm max-w-[300px]">{f.comment || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {feedback.map((f) => (
              <div key={f.id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-900 text-sm">
                    {new Date(f.session_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <StarRating rating={f.rating} />
                </div>
                <div className="text-xs">
                  <span className="text-slate-400">Coach: </span>
                  <span className="text-slate-700">
                    {f.coach ? `${f.coach.first_name} ${f.coach.last_name}` : "—"}
                  </span>
                </div>
                {f.comment && (
                  <p className="text-xs text-slate-600 mt-2">{f.comment}</p>
                )}
              </div>
            ))}
          </div>
        </>
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
