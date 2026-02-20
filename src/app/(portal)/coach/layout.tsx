import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SidebarLayout } from "@/components/layout/sidebar-layout";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/login");
  if (currentUser.profile.role !== "coach" && currentUser.profile.role !== "admin") {
    redirect("/player/dashboard");
  }

  return (
    <SidebarLayout portal="coach" user={currentUser.profile}>
      {children}
    </SidebarLayout>
  );
}
