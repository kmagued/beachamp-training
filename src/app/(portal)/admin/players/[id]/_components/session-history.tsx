import { Card, Badge, EmptyState } from "@/components/ui";
import { ClipboardCheck, Star, MessageSquare } from "lucide-react";
import type { AttendanceRow, FeedbackRow } from "./types";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "present": return <Badge variant="success">Present</Badge>;
    case "absent": return <Badge variant="danger">Absent</Badge>;
    case "excused": return <Badge variant="warning">Excused</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
        />
      ))}
    </div>
  );
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface SessionEntry {
  attendance: AttendanceRow;
  feedback: FeedbackRow | null;
}

interface SessionHistoryProps {
  attendance: AttendanceRow[];
  feedback: FeedbackRow[];
}

function mergeSessionData(attendance: AttendanceRow[], feedback: FeedbackRow[]): SessionEntry[] {
  // Index feedback by session_date for matching
  const feedbackByDate = new Map<string, FeedbackRow[]>();
  for (const f of feedback) {
    const existing = feedbackByDate.get(f.session_date) || [];
    existing.push(f);
    feedbackByDate.set(f.session_date, existing);
  }

  const entries: SessionEntry[] = attendance.map((a) => {
    const dateFeedback = feedbackByDate.get(a.session_date);
    let matched: FeedbackRow | null = null;
    if (dateFeedback && dateFeedback.length > 0) {
      matched = dateFeedback.shift()!;
    }
    return { attendance: a, feedback: matched };
  });

  // Any remaining feedback without matching attendance (orphan feedback)
  for (const [, remaining] of feedbackByDate) {
    for (const f of remaining) {
      entries.push({
        attendance: {
          id: `fb-${f.id}`,
          session_date: f.session_date,
          session_time: null,
          status: "",
          notes: null,
          created_at: f.created_at,
          group: null,
          marked_by_profile: null,
        },
        feedback: f,
      });
    }
  }

  // Sort by session_date descending
  entries.sort((a, b) => b.attendance.session_date.localeCompare(a.attendance.session_date));

  return entries;
}

export function SessionHistory({ attendance, feedback }: SessionHistoryProps) {
  const entries = mergeSessionData(attendance, feedback);

  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-4 h-4 text-slate-400" />
        Session History
        {entries.length > 0 && (
          <span className="text-xs font-normal text-slate-400">({entries.length})</span>
        )}
      </h2>

      {entries.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Date</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Time</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Group</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Status</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Feedback</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Coach</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.attendance.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-medium text-slate-900">
                      {formatDate(entry.attendance.session_date)}
                    </td>
                    <td className="py-3 text-slate-500">
                      {entry.attendance.session_time ? formatTime(entry.attendance.session_time) : "—"}
                    </td>
                    <td className="py-3 text-slate-700">{entry.attendance.group?.name || "—"}</td>
                    <td className="py-3">
                      {entry.attendance.status ? <StatusBadge status={entry.attendance.status} /> : "—"}
                    </td>
                    <td className="py-3 max-w-[300px]">
                      {entry.feedback ? (
                        <div className="space-y-1">
                          <StarRating rating={entry.feedback.rating} />
                          {entry.feedback.comment && (
                            <p className="text-xs text-slate-500 line-clamp-2">{entry.feedback.comment}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 text-slate-500 text-sm">
                      {entry.feedback?.coach
                        ? `${entry.feedback.coach.first_name} ${entry.feedback.coach.last_name}`
                        : entry.attendance.marked_by_profile
                          ? `${entry.attendance.marked_by_profile.first_name} ${entry.attendance.marked_by_profile.last_name}`
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {entries.map((entry) => (
              <div key={entry.attendance.id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-900 text-sm">
                    {formatDate(entry.attendance.session_date)}
                  </span>
                  {entry.attendance.status && <StatusBadge status={entry.attendance.status} />}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Group</span>
                    <p className="text-slate-700 font-medium">{entry.attendance.group?.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Time</span>
                    <p className="text-slate-700 font-medium">{entry.attendance.session_time ? formatTime(entry.attendance.session_time) : "—"}</p>
                  </div>
                  {entry.feedback && (
                    <div className="col-span-2 pt-2 mt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2 mb-1">
                        <MessageSquare className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-400">Feedback</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <StarRating rating={entry.feedback.rating} />
                        <span className="text-slate-500">
                          {entry.feedback.coach ? `${entry.feedback.coach.first_name} ${entry.feedback.coach.last_name}` : ""}
                        </span>
                      </div>
                      {entry.feedback.comment && (
                        <p className="text-slate-600 mt-1">{entry.feedback.comment}</p>
                      )}
                    </div>
                  )}
                  {entry.attendance.notes && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Notes</span>
                      <p className="text-slate-600">{entry.attendance.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<ClipboardCheck className="w-8 h-8" />}
          title="No Sessions"
          description="No session records for this player yet."
        />
      )}
    </Card>
  );
}
