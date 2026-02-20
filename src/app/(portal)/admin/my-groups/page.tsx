import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { CoachGroups } from "@/components/coach/CoachGroups";

export default async function AdminMyGroupsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">My Groups</h1>
        <p className="text-slate-500 text-sm">
          All active training groups (admin view)
        </p>
      </div>
      <CoachGroups
        coachId={currentUser.id}
        isAdmin={true}
      />
    </div>
  );
}
