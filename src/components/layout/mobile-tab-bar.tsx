"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { groupBySection } from "@/lib/nav/sections";
import { pagesUnderMore } from "@/lib/nav/tab-bar";

type Icon = ComponentType<{ className?: string }>;

export interface TabBarItem {
  key: string;
  label: string;
  href: string;
  section?: string;
  badge?: string;
  icon?: Icon;
}

/** How far the sheet has to be dragged down before letting go closes it */
const DISMISS_PX = 80;

/**
 * Phone navigation: a tab bar of the pages used most, and a More sheet that rises from
 * behind it with the rest (no More at all when every page is a tab). "tiles" suits a
 * short menu; "sections" keeps a long one in the same groups as the desktop sidebar.
 */
export function MobileTabBar({
  tabs,
  items,
  activeKey,
  layout = "tiles",
  footer,
}: {
  /** The pages on the bar; More comes after them when some pages are left over */
  tabs: { key: string; label: string; icon: Icon }[];
  /** The whole menu: whatever isn't a tab goes in the More sheet */
  items: TabBarItem[];
  activeKey: string;
  layout?: "tiles" | "sections";
  /** Shown under the sheet's links */
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const drag = useRef({ startY: 0, fromTop: false });
  const scrollRef = useRef<HTMLDivElement>(null);

  const hrefOf = new Map(items.map((item) => [item.key, item.href]));
  const moreItems = pagesUnderMore(tabs, items);
  const hasMore = moreItems.length > 0;
  const moreIsActive = moreItems.some((item) => item.key === activeKey);
  const moreHasNew = moreItems.some((item) => item.badge);

  // A new page closes the sheet, however it was reached
  useEffect(() => setOpen(false), [activeKey]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: 0 });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const tabClass = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-semibold transition-colors",
      active ? "text-primary-800" : "text-primary-700/50 active:text-primary-800",
    );
  const pillClass = (active: boolean) =>
    cn("relative flex items-center justify-center w-12 h-7 rounded-full transition-colors duration-200", active && "bg-primary-50");

  const newTag = (label: string, className?: string) => (
    <span
      className={cn(
        "rounded-full bg-accent px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-primary-900",
        className,
      )}
    >
      {label}
    </span>
  );

  const tile = (item: TabBarItem) => {
    const ItemIcon = item.icon;
    const isActive = item.key === activeKey;
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive ? "page" : undefined}
          className="relative flex flex-col items-center gap-2 rounded-2xl px-1 py-3 text-center transition-colors active:bg-sand/50"
        >
          <span
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center",
              isActive ? "bg-primary-800 text-white" : "bg-primary-50 text-primary-800",
            )}
          >
            {ItemIcon && <ItemIcon className="w-5 h-5" />}
          </span>
          <span className="text-xs font-medium leading-tight text-primary-900">{item.label}</span>
          {item.badge && newTag(item.badge, "absolute top-1.5 left-1/2 ml-3 ring-2 ring-white")}
        </Link>
      </li>
    );
  };

  const row = (item: TabBarItem) => {
    const ItemIcon = item.icon;
    const isActive = item.key === activeKey;
    return (
      <li key={item.key}>
        <Link
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-xl px-2.5 py-2 min-h-11 text-[13px] font-medium leading-tight transition-colors",
            isActive ? "bg-primary-800 text-white" : "text-primary-900 active:bg-sand/50",
          )}
        >
          <span
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              isActive ? "bg-white/15" : "bg-primary-50 text-primary-800",
            )}
          >
            {ItemIcon && <ItemIcon className="w-4 h-4" />}
          </span>
          <span className="min-w-0">{item.label}</span>
          {item.badge && newTag(item.badge, "ml-auto shrink-0")}
        </Link>
      </li>
    );
  };

  return (
    <div className="md:hidden">
      {hasMore && (
        <>
          {/* Dims the page above the tab bar; a tap anywhere on it closes the sheet */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className={cn(
              "fixed inset-0 z-40 bg-primary-900/25 transition-opacity duration-300 motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          />

          {/* More: slides up from behind the tab bar. Dragging it down closes it, once its list is
              scrolled to the top (before that, a drag scrolls the list). */}
          <div
            id="more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More pages"
            inert={!open}
            onTouchStart={(e) => {
              drag.current = { startY: e.touches[0].clientY, fromTop: (scrollRef.current?.scrollTop ?? 0) <= 0 };
            }}
            onTouchMove={(e) => {
              const dy = e.touches[0].clientY - drag.current.startY;
              if (drag.current.fromTop && dy > 0) setDragY(dy);
            }}
            onTouchEnd={() => {
              if ((dragY ?? 0) > DISMISS_PX) setOpen(false);
              setDragY(null);
            }}
            style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
            className={cn(
              "fixed inset-x-0 z-40 bottom-[var(--tab-bar-h)] flex flex-col max-h-[calc(100dvh_-_var(--tab-bar-h)_-_5rem)] rounded-t-3xl bg-white",
              "shadow-[0_-16px_40px_-16px_rgba(12,49,58,0.3)]",
              dragY === null && "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              open ? "translate-y-0" : "translate-y-full",
            )}
          >
            <div className="shrink-0 pt-2.5 pb-3" aria-hidden>
              <div className="mx-auto h-1 w-10 rounded-full bg-slate-300" />
            </div>
            <div
              ref={scrollRef}
              className={cn("overflow-y-auto overscroll-contain px-4", dragY ? "overflow-hidden" : "", footer ? "pb-2" : "pb-4")}
            >
              {layout === "tiles" ? (
                <ul className="grid grid-cols-3 gap-2">{moreItems.map(tile)}</ul>
              ) : (
                <div className="space-y-4">
                  {groupBySection(moreItems).map((group) => (
                    <section key={group.section ?? `top-${group.items[0].key}`}>
                      {group.section && (
                        <h3 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-primary-700/45">
                          {group.section}
                        </h3>
                      )}
                      <ul className="grid grid-cols-2 gap-1">{group.items.map(row)}</ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
            {footer && <div className="shrink-0 px-4 pt-2 pb-4 border-t border-primary-100">{footer}</div>}
          </div>
        </>
      )}

      {/* Above the sheet and its backdrop, so it stays usable while More is open */}
      <nav
        aria-label="Main"
        className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-primary-100 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + (hasMore ? 1 : 0)}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => {
            const isActive = !open && activeKey === tab.key;
            const TabIcon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={hrefOf.get(tab.key) ?? "/"}
                onClick={() => setOpen(false)}
                aria-current={activeKey === tab.key ? "page" : undefined}
                className={tabClass(isActive)}
              >
                <span className={pillClass(isActive)}>
                  <TabIcon className="w-5 h-5" />
                </span>
                {tab.label}
              </Link>
            );
          })}
          {hasMore && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="more-sheet"
              className={tabClass(open || moreIsActive)}
            >
              <span className={pillClass(open || moreIsActive)}>
                <LayoutGrid className="w-5 h-5" />
                {moreHasNew && !open && (
                  <span className="absolute top-0.5 right-2.5 w-2 h-2 rounded-full bg-accent ring-2 ring-white" aria-label="Something new" />
                )}
              </span>
              More
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
