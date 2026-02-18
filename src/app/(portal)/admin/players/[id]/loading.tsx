import { Skeleton } from "@/components/ui";

export default function PlayerDetailLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Skeleton className="h-4 w-28 mb-4" />

      {/* Header card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>

      {/* Profile info */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-6">
            <Skeleton className="h-5 w-36 mb-4" />
            <div className="space-y-4">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 mt-0.5" />
                  <div>
                    <Skeleton className="h-3 w-16 mb-1" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>

      {/* Subscriptions history */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <Skeleton className="h-5 w-44 mb-4" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Placeholder sections */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-6">
            <Skeleton className="h-5 w-32 mb-4" />
            <div className="py-8 flex flex-col items-center">
              <Skeleton className="h-8 w-8 mb-3" />
              <Skeleton className="h-4 w-28 mb-1" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
