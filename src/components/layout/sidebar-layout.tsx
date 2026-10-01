"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { branding } from "@/lib/config/branding";
import { logout } from "@/lib/actions/auth";
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  User,
  Users,
  CreditCard,
  Package,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  Calendar,
  GraduationCap,
  UsersRound,
  Receipt,
  ClipboardList,
  Ticket,
  UserCheck,
  PanelLeftClose,
  PanelLeftOpen,
  ImageIcon,
  Shirt,
  Tags,
  BarChart3,
  ChevronRight,
  Trophy,
  Award,
} from "lucide-react";
import type { Profile } from "@/types/database";
import { NotificationBell } from "./notification-bell";
import { groupBySection, parseOpenSections, sectionOfKey, toggleSection, withSection } from "@/lib/nav/sections";

type Portal = "player" | "coach" | "admin";

/** foldSections: section headings fold their links away (for portals with long menus) */
const portalConfig: Record<Portal, { label: string; shortLabel: string; avatar: string; labelColor: string; accentBg: string; accentText: string; foldSections: boolean }> = {
  player: { label: "Player Portal", shortLabel: "PP", avatar: "bg-primary-800", labelColor: "text-primary-800", accentBg: "bg-primary-800", accentText: "text-white", foldSections: false },
  coach: { label: "Coach Portal", shortLabel: "CP", avatar: "bg-primary-800", labelColor: "text-primary-800", accentBg: "bg-primary-800", accentText: "text-white", foldSections: false },
  admin: { label: "Admin Portal", shortLabel: "AP", avatar: "bg-primary-800", labelColor: "text-primary-800", accentBg: "bg-primary-800", accentText: "text-white", foldSections: true },
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
  coaches: GraduationCap,
  users: ShieldCheck,
  groups: UsersRound,
  "my-groups": UsersRound,
  schedule: Calendar,
  finances: Receipt,
  "promo-codes": Ticket,
  "daily-report": ClipboardList,
  "private-sessions": UserCheck,
  "schedule-photos": ImageIcon,
  merch: Shirt,
  "merch-categories": Tags,
  "merch-analytics": BarChart3,
  leaderboard: Trophy,
  achievements: Award,
} as const;

/** badge: a short tag shown next to the label, e.g. "New" for a section players haven't seen yet */
type NavItem = { key: string; label: string; href: string; section?: string; badge?: string };

const playerNav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/player/dashboard" },
  { key: "sessions", label: "Sessions", href: "/player/sessions", section: "Training" },
  { key: "private-sessions", label: "Private Sessions", href: "/player/private-sessions", section: "Training" },
  { key: "leaderboard", label: "Leaderboard", href: "/player/leaderboard", section: "Competitions" },
  { key: "achievements", label: "Achievements", href: "/player/achievements", section: "Competitions" },
  { key: "merch", label: "Products", href: "/player/merch", section: "Merch", badge: "New" },
  { key: "subscriptions", label: "Subscriptions", href: "/player/subscriptions", section: "Account" },
  { key: "feedback", label: "Feedback", href: "/player/feedback", section: "Account" },
  { key: "profile", label: "Profile", href: "/player/profile", section: "Account" },
];

const coachNav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/coach/dashboard" },
  { key: "schedule", label: "Schedule", href: "/coach/schedule" },
  { key: "my-groups", label: "My Groups", href: "/coach/groups" },
  { key: "leaderboard", label: "Leaderboard", href: "/coach/leaderboard" },
  { key: "feedback", label: "Feedback", href: "/coach/feedback" },
];

const adminNav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard" },
  { key: "players", label: "Players", href: "/admin/players", section: "People" },
  { key: "coaches", label: "Coaches", href: "/admin/coaches", section: "People" },
  { key: "groups", label: "Groups", href: "/admin/groups", section: "People" },
  { key: "finances", label: "Finances", href: "/admin/finances", section: "Finance" },
  { key: "packages", label: "Packages", href: "/admin/packages", section: "Finance" },
  { key: "promo-codes", label: "Promo Codes", href: "/admin/promo-codes", section: "Finance" },
  { key: "merch", label: "Products", href: "/admin/merch", section: "Merch" },
  { key: "merch-categories", label: "Categories", href: "/admin/merch/categories", section: "Merch" },
  { key: "merch-analytics", label: "Analytics", href: "/admin/merch/analytics", section: "Merch" },
  { key: "schedule", label: "Schedule", href: "/admin/schedule", section: "Training" },
  { key: "schedule-photos", label: "Schedule Photos", href: "/admin/schedule-photos", section: "Training" },
  { key: "daily-report", label: "Daily Report", href: "/admin/daily-report", section: "Training" },
  { key: "private-sessions", label: "Private Sessions", href: "/admin/private-sessions", section: "Training" },
  { key: "my-groups", label: "My Groups", href: "/admin/my-groups", section: "Training" },
  { key: "feedback", label: "Feedback", href: "/admin/feedback", section: "Training" },
  // Its own section: competitions will join the leaderboard here
  { key: "leaderboard", label: "Leaderboard", href: "/admin/leaderboard", section: "Competitions" },
  { key: "whatsapp-templates", label: "WhatsApp Templates", href: "/admin/whatsapp-templates", section: "Messaging" },
  { key: "users", label: "Admins", href: "/admin/users", section: "System" },
];

function NavBadge({ label }: { label: string }) {
  return (
    <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-primary-900">
      {label}
    </span>
  );
}

interface SidebarLayoutProps {
  portal: Portal;
  user: Pick<Profile, "id" | "first_name" | "last_name" | "role" | "email">;
  children: React.ReactNode;
}

const SIDEBAR_W = 220;
const SIDEBAR_COLLAPSED_W = 64;

export function SidebarLayout({ portal, user, children }: SidebarLayoutProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const config = portalConfig[portal];
  const navItems = portal === "admin" ? adminNav : portal === "coach" ? coachNav : playerNav;

  const initials = `${(user.first_name || "")[0] || ""}${(user.last_name || "")[0] || ""}`.toUpperCase() || "U";
  const notifHref = portal === "admin" ? "/admin/notifications" : portal === "coach" ? "/coach/notifications" : "/player/notifications";

  const sortedNav = [...navItems].sort((a, b) => b.href.length - a.href.length);
  const matched = sortedNav.find((item) => pathname.startsWith(item.href))?.key;
  const activeKey = matched || (pathname.startsWith(`/${portal}/subscribe`) ? "subscriptions" : "dashboard");

  const sidebarW = collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_W;

  // Fold-away sections: the current page's section opens on arrival; whatever the admin
  // opens or closes is remembered in this browser
  const activeSection = sectionOfKey(navItems, activeKey);
  const sectionsKey = `beachamp:sidebar-sections:${portal}`;
  const [openSections, setOpenSections] = useState<string[]>(() => (activeSection ? [activeSection] : []));
  const sectionsRestored = useRef(false);

  useEffect(() => {
    if (!config.foldSections) return;
    let saved: string[] | null = null;
    try {
      saved = parseOpenSections(localStorage.getItem(sectionsKey));
    } catch {
      // Storage blocked (private mode, disabled site data): start from the current section
    }
    if (saved) setOpenSections(withSection(saved, activeSection));
    sectionsRestored.current = true;
    // Runs once on mount; later visits are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setOpenSections((open) => withSection(open, activeSection));
  }, [activeSection]);

  useEffect(() => {
    if (!config.foldSections || !sectionsRestored.current) return;
    try {
      localStorage.setItem(sectionsKey, JSON.stringify(openSections));
    } catch {
      // Not saved; folding still works for this visit
    }
  }, [config.foldSections, sectionsKey, openSections]);

  const desktopLink = (item: NavItem) => {
    const Icon = iconMap[item.key as keyof typeof iconMap];
    const isActive = activeKey === item.key;
    return (
      <Link
        key={item.key}
        href={item.href}
        title={collapsed ? (item.badge ? `${item.label} (${item.badge.toLowerCase()})` : item.label) : undefined}
        className={cn(
          "relative flex items-center rounded-lg text-[13px] font-medium transition-colors",
          collapsed ? "justify-center p-2" : "gap-2.5 px-3 py-1.5",
          isActive
            ? cn(config.accentBg, config.accentText)
            : "text-primary-700/70 hover:text-primary-900 hover:bg-sand/50",
        )}
      >
        {Icon && <Icon className="w-4 h-4 shrink-0" />}
        {!collapsed && <span className="truncate">{item.label}</span>}
        {item.badge && !collapsed && <NavBadge label={item.badge} />}
        {item.badge && collapsed && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent ring-2 ring-white" aria-hidden="true" />
        )}
      </Link>
    );
  };

  const mobileLink = (item: NavItem) => {
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
            : "text-primary-700/70 hover:text-primary-900 hover:bg-sand/50",
        )}
      >
        {Icon && <Icon className="w-[18px] h-[18px]" />}
        {item.label}
        {item.badge && <NavBadge label={item.badge} />}
      </Link>
    );
  };

  /** Folded menu: headings are buttons that show or hide their links */
  const foldedNav = (variant: "desktop" | "mobile") =>
    groupBySection(navItems).map((group) => {
      const link = variant === "desktop" ? desktopLink : mobileLink;
      if (!group.section) {
        return (
          <div key={`top-${group.items[0].key}`} className="space-y-1">
            {group.items.map(link)}
          </div>
        );
      }
      const section = group.section;
      const open = openSections.includes(section);
      const listId = `nav-${variant}-${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      return (
        <div key={section} className="pt-2">
          <button
            type="button"
            onClick={() => setOpenSections((o) => toggleSection(o, section))}
            aria-expanded={open}
            aria-controls={listId}
            className={cn(
              "w-full flex items-center justify-between rounded-lg px-3 font-semibold uppercase tracking-wider transition-colors hover:bg-sand/50 hover:text-primary-900",
              variant === "desktop" ? "py-1.5 text-[10px]" : "py-2.5 text-[11px]",
              open ? "text-primary-800/70" : "text-primary-700/45",
            )}
          >
            <span>{section}</span>
            <span className="flex items-center gap-1.5 normal-case tracking-normal">
              {!open && group.items.some((i) => i.badge) && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-label="Has something new" />
              )}
              {!open && <span className="font-medium text-primary-700/35">{group.items.length}</span>}
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-150", open && "rotate-90")} aria-hidden="true" />
            </span>
          </button>
          {open && (
            <div id={listId} className="space-y-1 mt-0.5">
              {group.items.map(link)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="min-h-screen flex bg-sand/10">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-white shadow-[4px_0_24px_-12px_rgba(18,75,93,0.08)] fixed inset-y-0 left-0 z-30 transition-[width] duration-200 ease-in-out",
        )}
        style={{ width: sidebarW }}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between shrink-0 px-3">
          {!collapsed && (
            <p className={cn("text-[11px] font-semibold uppercase tracking-[0.15em] pl-2", config.labelColor)}>
              {config.label}
            </p>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "p-1.5 rounded-lg text-primary-700/50 hover:text-primary-900 hover:bg-sand/50 transition-colors",
              collapsed && "mx-auto",
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 pt-2 overflow-y-auto overflow-x-hidden space-y-1">
          {config.foldSections && !collapsed
            ? foldedNav("desktop")
            : navItems.map((item, index) => {
                const prevItem = index > 0 ? navItems[index - 1] : null;
                const showSection = item.section && item.section !== prevItem?.section;
                return (
                  <div key={item.key}>
                    {showSection && !collapsed && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-700/40 mt-4 mb-1 px-3">
                        {item.section}
                      </p>
                    )}
                    {showSection && collapsed && <div className="h-3" />}
                    {desktopLink(item)}
                  </div>
                );
              })}
        </nav>

        {/* Dev portal switcher */}
        {process.env.NODE_ENV === "development" && !collapsed && (
          <div className="px-3 border-t border-primary-200/60 pt-3 pb-4 mt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-700/40 px-3 mb-1.5">Switch Portal</p>
            <div className="flex gap-1">
              {(["admin", "coach", "player"] as const).map((p) => (
                <a
                  key={p}
                  href={`/${p}/dashboard`}
                  className={cn(
                    "flex-1 text-center py-1.5 rounded-md text-[11px] font-medium transition-colors",
                    portal === p
                      ? "bg-primary-50 text-primary-700"
                      : "text-primary-700/50 hover:text-primary-900 hover:bg-sand/50"
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Brand mark at bottom */}
        <div className={cn("shrink-0 flex items-center justify-center px-3 pb-8 pt-2", collapsed && "px-1")}>
          <Link href={navItems[0].href} className="opacity-60 hover:opacity-100 transition-opacity">
            <Image
              src="/images/logo.png"
              alt={branding.name}
              width={collapsed ? 40 : 160}
              height={collapsed ? 40 : 56}
              priority
              className={cn("object-contain", collapsed ? "w-10 h-10" : "h-14 w-auto")}
            />
          </Link>
        </div>
      </aside>

      {/* Top navbar */}
      <header className="fixed top-0 right-0 left-0 md:left-[var(--sidebar-w)] z-30 bg-[#FDFCF9] shadow-[0_4px_24px_-12px_rgba(18,75,93,0.08)] h-20 transition-[left] duration-200">
        <div className="relative flex items-center justify-between h-full px-4">
          {/* Left: hamburger on mobile */}
          <div className="flex items-center">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden text-primary-800 p-1 -ml-1"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Center: logo */}
          <Link
            href="/"
            aria-label={branding.name}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center"
          >
            <Image
              src="/images/logo.png"
              alt={branding.name}
              width={240}
              height={80}
              priority
              className="h-16 w-auto object-contain"
            />
          </Link>

          {/* Right: notifications + user */}
          <div className="flex items-center gap-2">
            <NotificationBell userId={user.id} href={notifHref} />
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-primary-200/60 ml-1">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                  config.avatar,
                )}
              >
                {initials}
              </div>
              <span className="text-sm font-medium text-primary-800 max-w-[140px] truncate">
                {user.first_name} {user.last_name}
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="p-2 rounded-lg text-primary-700/50 hover:text-primary-900 hover:bg-sand/50 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
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
          "md:hidden fixed inset-y-0 left-0 w-64 bg-white border-r border-primary-200/60 z-50 flex flex-col transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="h-14 flex items-center px-5 shrink-0">
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.15em]", config.labelColor)}>
            {config.label}
          </p>
        </div>
        <nav className="flex-1 px-3 pt-2 overflow-y-auto">
          {config.foldSections
            ? foldedNav("mobile")
            : navItems.map((item, index) => {
                const prevItem = index > 0 ? navItems[index - 1] : null;
                const showSection = item.section && item.section !== prevItem?.section;
                return (
                  <div key={item.key}>
                    {showSection && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-700/40 mt-4 mb-1 px-3">
                        {item.section}
                      </p>
                    )}
                    {mobileLink(item)}
                  </div>
                );
              })}
        </nav>

        {process.env.NODE_ENV === "development" && (
          <div className="px-3 border-t border-primary-200/60 pt-3 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-700/40 px-3 mb-1.5">Switch Portal</p>
            <div className="flex gap-1">
              {(["admin", "coach", "player"] as const).map((p) => (
                <a
                  key={p}
                  href={`/${p}/dashboard`}
                  className={cn(
                    "flex-1 text-center py-1.5 rounded-md text-[11px] font-medium transition-colors",
                    portal === p
                      ? "bg-primary-50 text-primary-700"
                      : "text-primary-700/50 hover:text-primary-900 hover:bg-sand/50"
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Brand mark at bottom */}
        <div className="shrink-0 flex items-center justify-center px-3 pb-8 pt-2">
          <Link
            href={navItems[0].href}
            onClick={() => setMobileOpen(false)}
            className="opacity-60 hover:opacity-100 transition-opacity"
          >
            <Image
              src="/images/logo.png"
              alt={branding.name}
              width={160}
              height={56}
              priority
              className="h-14 w-auto object-contain"
            />
          </Link>
        </div>
      </div>

      {/* Main content — desktop gets sidebar margin via CSS variable */}
      <style>{`:root { --sidebar-w: ${sidebarW}px; }`}</style>
      <main className="relative flex-1 min-w-0 overflow-x-hidden pt-20 md:ml-[var(--sidebar-w)] transition-[margin] duration-200 bg-sand/10">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 opacity-[0.035] z-0"
          style={{
            backgroundImage: "url('/images/pattern.jpeg')",
            backgroundSize: "1100px",
            backgroundRepeat: "repeat",
          }}
        />
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
