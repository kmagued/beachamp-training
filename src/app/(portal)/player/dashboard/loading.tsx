import { Skeleton } from "@/components/ui";

export default function PlayerDashboardLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-8 w-60 mb-2" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Plan, streak and credits */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        <div className="sm:col-span-2 lg:col-span-1 bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <Skeleton className="h-5 w-28 mb-4" />
          <Skeleton className="h-11 w-24 mb-3" />
          <Skeleton className="h-1.5 w-full mb-4" />
          <div className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-28" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
            <Skeleton className="h-5 w-36 mb-4" />
            <Skeleton className="h-11 w-16 mb-3" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
        <Skeleton className="h-5 w-36 mb-4" />
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div>
            <Skeleton className="h-4 w-28 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
