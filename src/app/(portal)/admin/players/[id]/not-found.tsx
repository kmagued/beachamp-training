import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { UserX } from "lucide-react";

export default function PlayerNotFound() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto flex items-center justify-center min-h-[60vh]">
      <EmptyState
        icon={<UserX className="w-12 h-12" />}
        title="Player Not Found"
        description="The player you're looking for doesn't exist or has been removed."
        action={
          <Link
            href="/admin/players"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Back to Players
          </Link>
        }
      />
    </div>
  );
}
