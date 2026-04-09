import { Skeleton } from "@/components/ui";

export default function AdminScheduleLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-7 w-40 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-[480px] w-full rounded-2xl" />
    </div>
  );
}
