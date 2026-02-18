import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SidebarLayout } from "@/components/layout/sidebar-layout";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/login");
  if (currentUser.profile.role !== "player") redirect("/login");

  return (
    <SidebarLayout portal="player" user={currentUser.profile}>
      {children}
    </SidebarLayout>
  );
}
