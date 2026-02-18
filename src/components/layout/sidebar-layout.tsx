"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/ui";
import { logout } from "@/lib/actions/auth";
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  User,
  Users,
  CreditCard,
  Package,
  UserCheck,
  ShieldCheck,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import type { Profile } from "@/types/database";

type Portal = "player" | "coach" | "admin";

const portalConfig: Record<Portal, { label: string; avatar: string; labelColor: string; accentBg: string; accentText: string }> = {
  player: { label: "Player Portal", avatar: "bg-primary", labelColor: "text-primary", accentBg: "bg-primary-50", accentText: "text-primary-700" },
  coach: {
    label: "Coach Portal",
    avatar: "bg-brand-coach",
    labelColor: "text-brand-coach",
    accentBg: "bg-brand-coach/10",
    accentText: "text-brand-coach",
  },
  admin: {
    label: "Admin Portal",
    avatar: "bg-primary",
    labelColor: "text-primary",
    accentBg: "bg-primary-50",
    accentText: "text-primary-700",
  },
};

const iconMap = {
  dashboard: LayoutDashboard,
  sessions: CalendarDays,
  subscriptions: CreditCard,
  feedback: MessageSquare,
  profile: User,
  players: Users,
  payments: CreditCard,
  packages: Package,
  coaches: UserCheck,
  users: ShieldCheck,
} as const;

const playerNav = [
  { key: "dashboard", label: "Dashboard", href: "/player/dashboard" },
  { key: "sessions", label: "My Sessions", href: "/player/sessions" },
  { key: "subscriptions", label: "Subscriptions", href: "/player/subscriptions" },
  { key: "feedback", label: "Feedback", href: "/player/feedback" },
  { key: "profile", label: "Profile", href: "/player/profile" },
] as const;

const adminNav = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
  { key: "players", label: "Players", href: "/admin/players" },
  { key: "coaches", label: "Coaches", href: "/admin/coaches" },
  { key: "payments", label: "Payments", href: "/admin/payments" },
  { key: "packages", label: "Packages", href: "/admin/packages" },
  { key: "users", label: "User Mgmt", href: "/admin/users" },
] as const;

interface SidebarLayoutProps {
  portal: Portal;
  user: Pick<Profile, "first_name" | "last_name" | "role" | "email">;
  children: React.ReactNode;
}

export function SidebarLayout({ portal, user, children }: SidebarLayoutProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const config = portalConfig[portal];
  const navItems = portal === "admin" ? adminNav : playerNav;

  const initials = `${(user.first_name || "")[0] || ""}${(user.last_name || "")[0] || ""}`.toUpperCase() || "U";

  const activeKey = navItems.find((item) => pathname.startsWith(item.href))?.key || "dashboard";

  return (
    <div className="min-h-screen flex bg-surface-bg">
      {/* Desktop sidebar — light */}
      <aside className="hidden md:flex flex-col w-[220px] bg-white border-r border-slate-200 fixed inset-y-0 left-0 z-30">
        {/* Brand */}
        <div className="px-5 pt-5 pb-4">
          <p className={cn("text-xs font-semibold uppercase tracking-wider mb-1", config.labelColor)}>{config.label}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 mt-2">
          {navItems.map((item) => {
            const Icon = iconMap[item.key as keyof typeof iconMap];
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5",
                  isActive
                    ? cn(config.accentBg, config.accentText)
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 pb-4 border-t border-slate-200 pt-3 mt-2">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white",
                config.avatar,
              )}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-[11px] text-slate-400 capitalize">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 inset-x-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-4 h-14">
        <Logo showName className="text-slate-900" size="sm" />
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-slate-600 p-1">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile slide-out menu */}
      <div
        className={cn(
          "md:hidden fixed inset-0 bg-black/30 z-40 transition-opacity duration-300",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setMobileOpen(false)}
      />
      <div
        className={cn(
          "md:hidden fixed inset-y-0 right-0 w-64 bg-white border-l border-slate-200 z-50 flex flex-col transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <p className={cn("text-xs font-semibold uppercase tracking-wider", config.labelColor)}>{config.label}</p>
          <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-3">
          {navItems.map((item) => {
            const Icon = iconMap[item.key as keyof typeof iconMap];
            const isActive = activeKey === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-0.5",
                  isActive
                    ? cn(config.accentBg, config.accentText)
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white",
                config.avatar,
              )}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-[11px] text-slate-400 capitalize">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      <main className="flex-1 min-w-0 overflow-x-hidden md:ml-[220px] pt-14 md:pt-0">{children}</main>
    </div>
  );
}
