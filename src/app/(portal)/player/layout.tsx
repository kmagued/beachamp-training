import { getCurrentUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import type { Viewport } from "next";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { accountOf, isPlayer, portalsFor } from "@/lib/auth/portals";

// Edge to edge on notched phones (the tab bar pads itself clear of the home indicator),
// with the browser bar matching the header
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#FDFCF9",
};

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/login");
  // Players, and admins who also play (a player who coaches is role player)
  if (process.env.NODE_ENV !== "development" && !isPlayer(accountOf(currentUser.profile))) redirect("/login");

  return (
    <SidebarLayout portal="player" portals={portalsFor(accountOf(currentUser.profile))} user={currentUser.profile}>
      {children}
    </SidebarLayout>
  );
}
