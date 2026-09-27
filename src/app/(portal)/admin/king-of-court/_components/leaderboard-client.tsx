"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown, Trophy } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { buildStandings, groupScores, type ScoreRow, type Standing } from "@/lib/king-of-court/leaderboard";
import { shiftMonth } from "@/lib/king-of-court/month";
import { formatMonth, joinNames } from "@/lib/king-of-court/format";
import { PlayerBreakdownDrawer } from "./player-breakdown-drawer";

export interface LeaderboardGroup {
  id: string;
  name: string;
  level: string | null;
}

export interface PlayerName {
  first_name: string;
  last_name: string;
}

/** Where the pinned bar ends: the 80px site header plus the bar itself. Keep in step with scroll-mt-52 on the cards. */
const PINNED_OFFSET = 200;

/** #, player, points, sessions, best, chevron */
const ROW_GRID = "grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_4.25rem_2.75rem_1rem] items-center gap-x-2";

export function LeaderboardClient({
  month,
  currentMonth,
  groups,
  scores,
  players,
}: {
  month: string;
  currentMonth: string;
  groups: LeaderboardGroup[];
  scores: ScoreRow[];
  players: Record<string, PlayerName>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isCurrentMonth = month === currentMonth;

  const nameOf = (playerId: string) => {
    const p = players[playerId];
    return p ? `${p.first_name} ${p.last_name}` : "Unknown player";
  };

  const rowsByGroup = useMemo(() => groupScores(scores), [scores]);
  const standingsByGroup = useMemo(() => {
    const map = new Map<string, Standing[]>();
    for (const g of groups) {
      const standings = buildStandings(rowsByGroup.get(g.id) ?? []);
      // Players sharing a rank are listed by name
      standings.sort((a, b) => a.rank - b.rank || nameOf(a.player_id).localeCompare(nameOf(b.player_id)));
      map.set(g.id, standings);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, rowsByGroup, players]);

  const [activeGroup, setActiveGroup] = useState<string | null>(() => {
    const fromUrl = searchParams.get("group");
    return groups.some((g) => g.id === fromUrl) ? fromUrl : groups[0]?.id ?? null;
  });
  const [selected, setSelected] = useState<{ groupId: string; playerId: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const chipBarRef = useRef<HTMLDivElement | null>(null);
  const visibleGroups = useRef(new Set<string>());

  function goToMonth(next: string) {
    setDrawerOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (next === currentMonth) params.delete("month");
    else params.set("month", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function jumpTo(groupId: string) {
    setActiveGroup(groupId);
    cardRefs.current[groupId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    // History API: the chosen group survives a refresh without refetching the month
    const params = new URLSearchParams(window.location.search);
    params.set("group", groupId);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  // Opening with ?group= (a shared link, a refresh, a month change) lands on that card
  useEffect(() => {
    const groupId = searchParams.get("group");
    if (groupId) cardRefs.current[groupId]?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // While scrolling, highlight the chip of the topmost card just under the pinned bar
  useEffect(() => {
    const visible = visibleGroups.current;
    visible.clear();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.groupId;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = groups.find((g) => visible.has(g.id));
        if (first) setActiveGroup(first.id);
      },
      { rootMargin: `-${PINNED_OFFSET}px 0px -55% 0px` }
    );
    for (const g of groups) {
      const el = cardRefs.current[g.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [groups]);

  // Keep the highlighted chip in view when the chip row is wider than the screen
  useEffect(() => {
    const bar = chipBarRef.current;
    const chip = activeGroup ? chipRefs.current[activeGroup] : null;
    if (!bar || !chip) return;
    const outOfView =
      chip.offsetLeft < bar.scrollLeft || chip.offsetLeft + chip.offsetWidth > bar.scrollLeft + bar.clientWidth;
    if (outOfView) bar.scrollTo({ left: chip.offsetLeft - 16, behavior: "smooth" });
  }, [activeGroup]);

  const selectedGroup = selected ? groups.find((g) => g.id === selected.groupId) : undefined;
  const selectedStanding = selected
    ? standingsByGroup.get(selected.groupId)?.find((s) => s.player_id === selected.playerId)
    : undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Pinned under the site header: month picker and group chips */}
      <div className="sticky top-20 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 lg:-mt-8 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-3 mb-4 bg-[#FDFCF9]/95 backdrop-blur border-b border-slate-200/70">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">King of Court</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goToMonth(shiftMonth(month, -1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[5.5rem] text-center text-sm font-semibold text-slate-800 tabular-nums">
              {formatMonth(month)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={month >= currentMonth}
              onClick={() => goToMonth(shiftMonth(month, 1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {groups.length > 1 && (
          <div ref={chipBarRef} className="relative mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto no-scrollbar">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                ref={(el) => { chipRefs.current[g.id] = el; }}
                onClick={() => jumpTo(g.id)}
                aria-current={activeGroup === g.id ? "true" : undefined}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors",
                  activeGroup === g.id
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="w-10 h-10" />}
            title="No groups yet"
            description="Leaderboards appear here once groups exist and scores are logged from the Daily Report."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const standings = standingsByGroup.get(g.id) ?? [];
            const winners = standings.filter((s) => s.isWinner);
            return (
              <section
                key={g.id}
                ref={(el) => { cardRefs.current[g.id] = el; }}
                data-group-id={g.id}
                className="scroll-mt-52"
              >
                <Card className="p-0 overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 sm:py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold text-slate-900">{g.name}</h2>
                      {g.level && <Badge variant="neutral">{g.level}</Badge>}
                    </div>
                    {winners.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-sm text-slate-700">
                        <Crown className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                        <span>
                          <span className="font-medium">{isCurrentMonth ? "Leading" : "Winner"}:</span>{" "}
                          {joinNames(winners.map((w) => nameOf(w.player_id)))} · {winners[0].total} pts
                        </span>
                      </p>
                    )}
                  </div>

                  {standings.length === 0 ? (
                    <p className="px-4 sm:px-5 py-6 border-t border-slate-100 text-center text-xs text-slate-400">
                      No scores logged this month
                    </p>
                  ) : (
                    <div className="border-t border-slate-100">
                      <div className={cn(ROW_GRID, "px-4 sm:px-5 py-2 bg-slate-50/50 text-[11px] font-semibold text-slate-400 uppercase tracking-wider")}>
                        <span>#</span>
                        <span>Player</span>
                        <span className="text-right">Pts</span>
                        <span className="text-right">Sessions</span>
                        <span className="text-right">Best</span>
                        <span />
                      </div>
                      <div className="divide-y divide-slate-100">
                        {standings.map((s) => (
                          <button
                            key={s.player_id}
                            type="button"
                            onClick={() => {
                              setSelected({ groupId: g.id, playerId: s.player_id });
                              setDrawerOpen(true);
                            }}
                            className={cn(ROW_GRID, "w-full px-4 sm:px-5 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors")}
                          >
                            <span className="text-slate-400 tabular-nums">{s.rank}</span>
                            <span className="min-w-0 truncate font-medium text-slate-900">{nameOf(s.player_id)}</span>
                            <span className="text-right font-semibold text-slate-900 tabular-nums">{s.total}</span>
                            <span className="text-right text-slate-500 tabular-nums">{s.sessions}</span>
                            <span className="text-right text-slate-500 tabular-nums">{s.best}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 justify-self-end" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <PlayerBreakdownDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        playerName={selected ? nameOf(selected.playerId) : ""}
        groupName={selectedGroup?.name ?? ""}
        month={month}
        standing={selectedStanding}
        scores={selected ? rowsByGroup.get(selected.groupId) ?? [] : []}
      />
    </div>
  );
}
