import { Card, Badge, EmptyState } from "@/components/ui";
import { ClipboardCheck } from "lucide-react";
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

export function AttendanceHistory({ attendance }: { attendance: AttendanceRow[] }) {
  return (
    <Card className="mb-6">
      <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-4 h-4 text-slate-400" />
        Session Attendance
        {attendance.length > 0 && (
          <span className="text-xs font-normal text-slate-400">({attendance.length})</span>
        )}
      </h2>

      {attendance.length > 0 ? (
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
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Marked By</th>
                  <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 font-medium text-slate-900">
                      {new Date(a.session_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-3 text-slate-500">
                      {a.session_time ? formatTime(a.session_time) : "—"}
                    </td>
                    <td className="py-3 text-slate-700">{a.group?.name || "—"}</td>
                    <td className="py-3"><StatusBadge status={a.status} /></td>
                    <td className="py-3 text-slate-500">
                      {a.marked_by_profile ? `${a.marked_by_profile.first_name} ${a.marked_by_profile.last_name}` : "—"}
                    </td>
                    <td className="py-3 text-slate-400 text-xs max-w-[200px] truncate">{a.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {attendance.map((a) => (
              <div key={a.id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-900 text-sm">
                    {new Date(a.session_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Group</span>
                    <p className="text-slate-700 font-medium">{a.group?.name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Time</span>
                    <p className="text-slate-700 font-medium">{a.session_time ? formatTime(a.session_time) : "—"}</p>
                  </div>
                  {a.notes && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Notes</span>
                      <p className="text-slate-600">{a.notes}</p>
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
          description="No attendance records for this player yet."
        />
      )}
    </Card>
  );
}
