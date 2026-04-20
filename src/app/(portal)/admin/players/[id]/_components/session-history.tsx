import { Card, Badge, EmptyState } from "@/components/ui";
import { ClipboardCheck } from "lucide-react";
import { formatDate } from "@/lib/utils/format-date";
import type { AttendanceRow } from "./types";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "present": return <Badge variant="success">Present</Badge>;
    case "absent": return <Badge variant="danger">Absent</Badge>;
    case "excused": return <Badge variant="warning">Excused</Badge>;
    default: return <Badge variant="neutral">{status}</Badge>;
  }
}

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

interface SessionHistoryProps {
  attendance: AttendanceRow[];
}

export function SessionHistory({ attendance }: SessionHistoryProps) {
  const entries = [...attendance].sort((a, b) =>
    b.session_date.localeCompare(a.session_date),
  );

  return (
    <Card className="mb-6">
      <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-5 h-5 text-secondary" />
        Session History
        {entries.length > 0 && (
          <span className="text-xs font-semibold text-primary-700/50 bg-primary-50 rounded-full px-2 py-0.5 ml-1">{entries.length}</span>
        )}
      </h2>

      {entries.length > 0 ? (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100">
                  <th className="text-left text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider py-2">Date</th>
                  <th className="text-left text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider py-2">Time</th>
                  <th className="text-left text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider py-2">Group</th>
                  <th className="text-left text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider py-2">Status</th>
                  <th className="text-left text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider py-2">Marked by</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((a) => (
                  <tr key={a.id} className="border-b border-primary-100/60 last:border-0">
                    <td className="py-3 font-semibold text-primary-900">{formatDate(a.session_date)}</td>
                    <td className="py-3 text-primary-700/70">
                      {a.session_time ? formatTime(a.session_time) : "—"}
                    </td>
                    <td className="py-3 text-primary-800">{a.group?.name || "—"}</td>
                    <td className="py-3">
                      {a.status ? <StatusBadge status={a.status} /> : "—"}
                    </td>
                    <td className="py-3 text-primary-700/70 text-sm">
                      {a.marked_by_profile
                        ? `${a.marked_by_profile.first_name} ${a.marked_by_profile.last_name}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {entries.map((a) => (
              <div key={a.id} className="border border-primary-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-primary-900 text-sm">
                    {formatDate(a.session_date)}
                  </span>
                  {a.status && <StatusBadge status={a.status} />}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-primary-700/50 font-semibold uppercase tracking-wider text-[10px]">Group</span>
                    <p className="text-primary-900 font-medium">{a.group?.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-primary-700/50 font-semibold uppercase tracking-wider text-[10px]">Time</span>
                    <p className="text-primary-900 font-medium">{a.session_time ? formatTime(a.session_time) : "—"}</p>
                  </div>
                  {a.notes && (
                    <div className="col-span-2">
                      <span className="text-primary-700/50 font-semibold uppercase tracking-wider text-[10px]">Notes</span>
                      <p className="text-primary-800/80">{a.notes}</p>
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
