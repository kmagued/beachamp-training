import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { accountOf, coachOrAdmin, portalsFor } from "@/lib/auth/portals";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/login");
  const account = accountOf(currentUser.profile);
  // Coaches, admins, and players with coach access
  if (process.env.NODE_ENV !== "development" && !coachOrAdmin(account)) {
    redirect("/player/dashboard");
  }

  return (
    <SidebarLayout portal="coach" portals={portalsFor(account)} user={currentUser.profile}>
      {children}
    </SidebarLayout>
  );
}
