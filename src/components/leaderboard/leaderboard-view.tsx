"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Crown, Trophy } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { openingGroup } from "@/lib/king-of-court/access";
import { buildStandings, groupScores, type Standing } from "@/lib/king-of-court/leaderboard";
import type { LeaderboardData } from "@/lib/king-of-court/load";
import { shiftMonth } from "@/lib/king-of-court/month";
import { formatMonth, joinNames } from "@/lib/king-of-court/format";
import { PlayerBreakdownDrawer } from "./player-breakdown-drawer";

/** Gold, silver and bronze for the top three; everyone else gets a plain badge */
const PODIUM_BADGE: Record<number, string> = {
  1: "bg-amber-400 text-white",
  2: "bg-slate-300 text-slate-700",
  3: "bg-orange-300 text-white",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The King of Court leaderboard, shared by the admin, coach and player portals */
export function LeaderboardView({
  data,
  linkToDailyReport = false,
  viewerId,
  noGroups,
}: {
  /** Already limited to the groups this viewer may see */
  data: LeaderboardData;
  /** Admins: the breakdown's sessions open that day's Daily Report, where scores are fixed */
  linkToDailyReport?: boolean;
  /** Players: their own row is marked "You" */
  viewerId?: string;
  /** Shown when the viewer has no group on the leaderboard */
  noGroups: { title: string; description: string };
}) {
  const { month, currentMonth, groups, scores, players } = data;
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

  const [requestedGroup, setRequestedGroup] = useState<string | null>(() => searchParams.get("group"));
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The asked-for tab if this month shows it, else the first group with scores. Re-derived
  // on every render so a month without that group falls back instead of showing nothing.
  const activeGroup = openingGroup(
    groups.map((g) => g.id),
    new Set(rowsByGroup.keys()),
    requestedGroup
  );

  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function goToMonth(next: string) {
    setDrawerOpen(false);
    const params = new URLSearchParams(window.location.search);
    if (next === currentMonth) params.delete("month");
    else params.set("month", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openGroup(groupId: string) {
    setRequestedGroup(groupId);
    setDrawerOpen(false);
    // History API: the open tab survives a refresh without refetching the month
    const params = new URLSearchParams(window.location.search);
    params.set("group", groupId);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  // On phones the tab row scrolls sideways: keep the open tab in view
  useEffect(() => {
    const bar = tabBarRef.current;
    const tab = activeGroup ? tabRefs.current[activeGroup] : null;
    if (!bar || !tab) return;
    const outOfView =
      tab.offsetLeft < bar.scrollLeft || tab.offsetLeft + tab.offsetWidth > bar.scrollLeft + bar.clientWidth;
    if (outOfView) bar.scrollTo({ left: tab.offsetLeft - 16, behavior: "smooth" });
  }, [activeGroup]);

  const group = groups.find((g) => g.id === activeGroup);
  const standings = (activeGroup && standingsByGroup.get(activeGroup)) || [];
  const groupRows = (activeGroup && rowsByGroup.get(activeGroup)) || [];
  const winners = standings.filter((s) => s.isWinner);
  const sessionCount = new Set(groupRows.map((r) => `${r.schedule_session_id}|${r.session_date}`)).size;
  const selectedStanding = selectedPlayer ? standings.find((s) => s.player_id === selectedPlayer) : undefined;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight text-slate-900">Leaderboard</h1>
          <div className="flex items-center shrink-0 rounded-xl border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goToMonth(shiftMonth(month, -1))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="min-w-[5.25rem] text-center text-sm font-semibold text-slate-800 tabular-nums">
              {formatMonth(month)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              disabled={month >= currentMonth}
              onClick={() => goToMonth(shiftMonth(month, 1))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="mt-0.5 text-slate-500 text-sm">King of Court points by group</p>
      </div>

      {groups.length > 0 && (
        <div
          ref={tabBarRef}
          role="tablist"
          aria-label="Groups"
          className="relative -mx-4 px-4 sm:mx-0 sm:px-0 flex border-b border-slate-200 mb-5 overflow-x-auto no-scrollbar"
        >
          {groups.map((g) => {
            const isActive = g.id === activeGroup;
            return (
              <button
                key={g.id}
                ref={(el) => { tabRefs.current[g.id] = el; }}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => openGroup(g.id)}
                className={cn(
                  "shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                  isActive ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      )}

      {!group ? (
        <Card>
          <EmptyState icon={<Trophy className="w-10 h-10" />} title={noGroups.title} description={noGroups.description} />
        </Card>
      ) : standings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="w-10 h-10" />}
            title="No scores logged this month"
            description={
              linkToDailyReport
                ? `Scores for ${group.name} are entered on the Daily Report's Scores tab.`
                : "Points show up here once King of Court games are logged."
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {winners.length > 0 && (
            <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-4 sm:p-5">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Crown className="w-6 h-6 text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  {isCurrentMonth ? "Leading" : "Winner"} · {formatMonth(month, "long")}
                </p>
                <p className="text-lg font-semibold leading-snug text-slate-900">
                  {joinNames(winners.map((w) => nameOf(w.player_id)))}
                </p>
                <p className="text-sm text-slate-500">
                  {winners[0].total} pts · {plural(winners[0].sessions, "session")}
                </p>
              </div>
            </div>
          )}

          <Card className="p-0 sm:p-0 overflow-hidden">
            <div className="px-4 sm:px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <span>
                {plural(standings.length, "player")} · {plural(sessionCount, "session")}
              </span>
              <span className="pr-7">Points</span>
            </div>
            <div className="divide-y divide-slate-100">
              {standings.map((s) => {
                const isViewer = s.player_id === viewerId;
                return (
                  <button
                    key={s.player_id}
                    type="button"
                    onClick={() => {
                      setSelectedPlayer(s.player_id);
                      setDrawerOpen(true);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-left transition-colors",
                      isViewer ? "bg-primary-50/60 hover:bg-primary-50" : "hover:bg-slate-50"
                    )}
                  >
                    <span
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0",
                        (s.total > 0 && PODIUM_BADGE[s.rank]) || "bg-slate-100 text-slate-500"
                      )}
                    >
                      {s.rank}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-sm font-medium text-slate-900">{nameOf(s.player_id)}</span>
                        {isViewer && <Badge variant="info" className="shrink-0">You</Badge>}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {plural(s.sessions, "session")} · best {s.best}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="text-base font-semibold text-slate-900 tabular-nums">{s.total}</span>{" "}
                      <span className="text-xs text-slate-400">pts</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <PlayerBreakdownDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        playerName={selectedPlayer ? nameOf(selectedPlayer) : ""}
        groupName={group?.name ?? ""}
        month={month}
        standing={selectedStanding}
        scores={groupRows}
        linkToDailyReport={linkToDailyReport}
      />
    </div>
  );
}
