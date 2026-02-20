import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { ScheduleCalendar } from "@/components/coach/ScheduleCalendar";

export default async function AdminSchedulePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Schedule</h1>
        <p className="text-slate-500 text-sm">
          Weekly training schedule across all groups
        </p>
      </div>
      <ScheduleCalendar
        coachId={currentUser.id}
        isAdmin={true}
        sessionBasePath="/admin/sessions"
      />
    </div>
  );
}
