import { Skeleton } from "@/components/ui";

export default function KingOfCourtLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
