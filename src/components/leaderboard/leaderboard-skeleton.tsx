import { Skeleton } from "@/components/ui";

/** Loading state for every portal's Leaderboard page */
export function LeaderboardSkeleton() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>
      <div className="flex gap-4 mb-5 border-b border-slate-200 pb-2.5">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-24" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-2xl mb-4" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
