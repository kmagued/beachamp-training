import { Skeleton, TableRowSkeleton } from "@/components/ui";

export default function PlayerSessionsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-4 w-52" />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
            <Skeleton className="h-8 w-10 mb-2" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden p-0">
        <div className="sm:hidden divide-y divide-slate-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <Skeleton className="h-4 w-28 mb-1.5" />
                <Skeleton className="h-3 w-36" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
        <div className="hidden sm:block overflow-x-auto">
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
