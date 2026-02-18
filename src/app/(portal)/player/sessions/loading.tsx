import { Skeleton, TableRowSkeleton } from "@/components/ui";

export default function PlayerSessionsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-4 w-52" />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                {["Date", "Time", "Group", "Status"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={4} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
