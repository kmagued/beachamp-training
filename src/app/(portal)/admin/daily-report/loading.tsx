import { Skeleton } from "@/components/ui";

export default function DailyReportLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-7 w-44 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full max-w-md mb-4 rounded-lg" />
      <Skeleton className="h-[420px] w-full rounded-2xl" />
    </div>
  );
}
