import { Skeleton } from "@/components/ui";

export default function PlayerAchievementsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 sm:h-36 w-full rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-3 w-28 mb-3" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-3 w-20 mb-3" />
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
