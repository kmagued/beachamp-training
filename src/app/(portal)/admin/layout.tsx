import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
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
      user={currentUser.profile}
    >
      {children}
    </SidebarLayout>
  );
}
