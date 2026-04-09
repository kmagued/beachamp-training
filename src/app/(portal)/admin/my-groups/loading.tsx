import { Skeleton } from "@/components/ui";

export default function MyGroupsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
