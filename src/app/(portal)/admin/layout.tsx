import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { accountOf, portalsFor } from "@/lib/auth/portals";
import type { Viewport } from "next";

// Edge to edge on notched phones (the tab bar pads itself clear of the home indicator),
// with the browser bar matching the header
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#FDFCF9",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/login");
  if (process.env.NODE_ENV !== "development" && currentUser.profile.role !== "admin") redirect("/player/dashboard");

  return (
    <SidebarLayout
      portal="admin"
      portals={portalsFor(accountOf(currentUser.profile))}
      user={currentUser.profile}
    >
      {children}
    </SidebarLayout>
  );
}
