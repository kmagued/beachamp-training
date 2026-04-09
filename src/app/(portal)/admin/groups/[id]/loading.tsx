import { Skeleton } from "@/components/ui";

export default function GroupDetailLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <Skeleton className="h-4 w-24 mb-4" />
      <Skeleton className="h-8 w-56 mb-2" />
      <Skeleton className="h-4 w-80 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-[480px] w-full rounded-2xl" />
    </div>
  );
}
