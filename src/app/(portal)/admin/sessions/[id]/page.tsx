import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SessionDetail } from "@/components/coach/SessionDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminSessionDetailPage({ params }: PageProps) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { id } = await params;

  return (
    <SessionDetail
      scheduleSessionId={id}
      coachId={currentUser.id}
      isAdmin={true}
      basePath="/admin"
    />
  );
}
