"use client";

import { useState } from "react";
import { Card, Badge, Pagination } from "@/components/ui";
import { formatDate } from "@/lib/utils/format-date";

export interface SessionRecord {
  id: string;
  session_date: string;
  session_time: string | null;
  status: string;
  group_name: string | null;
}

function formatTime(time: string | null) {
  if (!time) return "—";
  const [h, m] = time.split(":");
  const hour = parseInt(h, 10);
  if (isNaN(hour)) return time;
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "present":
      return <Badge variant="success">Present</Badge>;
    case "absent":
      return <Badge variant="danger">Absent</Badge>;
    case "excused":
      return <Badge variant="warning">Excused</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

export function SessionsTable({ records }: { records: SessionRecord[] }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalPages = Math.ceil(records.length / pageSize);
  const pageRecords = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Date
              </th>
              <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Time
              </th>
              <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Group
              </th>
              <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((record, i) => (
              <tr
                key={record.id}
                className={`border-b border-slate-100 ${i % 2 === 1 ? "bg-[#FAFBFC]" : ""}`}
              >
                <td className="px-4 py-3 text-sm text-slate-900">{formatDate(record.session_date)}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{formatTime(record.session_time)}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{record.group_name || "—"}</td>
                <td className="px-4 py-3">{statusBadge(record.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {records.length > 10 && (
        <div className="px-4 pb-4">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </Card>
  );
}
