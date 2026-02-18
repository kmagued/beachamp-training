import { Card, Skeleton, TableRowSkeleton } from "@/components/ui";

export function UsersPageSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {["Name", "Email", "Role", "Status", "Registered"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="sm:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function UsersInlineSkeleton() {
  return (
    <>
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {["Name", "Email", "Role", "Status", "Registered"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} columns={5} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="sm:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
