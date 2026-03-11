import { RefObject, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { ArrowUpDown, ArrowUp, ArrowDown, Mail, Loader2, Check, X, Users, Package, CalendarDays, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format-date";
import type { PlayerRow, SortField, SortDir, ActivityStatus, SubscriptionStatus } from "./types";
import { getActivityStatus, getSubscriptionStatus, getLatestSubscription } from "./types";

function getDaysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

interface PlayersTableProps {
  players: PlayerRow[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  allPageSelected: boolean;
  selectAllRef: RefObject<HTMLInputElement | null>;
  getRowId: (id: string) => string;
  isHighlighted: (id: string) => boolean;
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  hasActiveFilters: boolean;
  onPlayerClick: (player: PlayerRow) => void;
  onLevelChange: (playerId: string, newLevel: string | null) => void;
  changingLevelId: string | null;
}

const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200 whitespace-nowrap";
const thSortable = `${thBase} cursor-pointer select-none hover:text-slate-600 transition-colors`;
const tdBase = "px-4 py-3 border-b border-slate-100";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function ActivityIcon({ status }: { status: ActivityStatus }) {
  if (status === "active") return <Check className="w-4 h-4 text-emerald-500" />;
  return <X className="w-4 h-4 text-slate-300" />;
}

function SubscriptionBadge({ status }: { status: SubscriptionStatus }) {
  switch (status) {
    case "active": return <Badge variant="success">Active</Badge>;
    case "attended": return <Badge variant="success">Attended</Badge>;
    case "expiring soon": return <Badge variant="warning">Expiring Soon</Badge>;
    case "expired": return <Badge variant="danger">Expired</Badge>;
    case "pending": return <Badge variant="warning">Pending Confirmation</Badge>;
    case "pending_payment": return <Badge variant="warning">Pending Payment</Badge>;
    case "none": return <Badge variant="neutral">No Sub</Badge>;
  }
}

const LEVEL_OPTIONS = [
  { value: "", label: "—" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "professional", label: "Professional" },
];

function LevelSelect({
  playerId,
  currentLevel,
  onLevelChange,
  isChanging,
}: {
  playerId: string;
  currentLevel: string | null;
  onLevelChange: (playerId: string, newLevel: string | null) => void;
  isChanging: boolean;
}) {
  return (
    <div className="relative inline-flex items-center">
      {isChanging ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : (
        <select
          value={currentLevel || ""}
          onChange={(e) => {
            const newLevel = e.target.value || null;
            if (newLevel === currentLevel) return;
            onLevelChange(playerId, newLevel);
          }}
          onClick={(e) => e.stopPropagation()}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
        >
          {LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function ContactIcons({ phone, email }: { phone: string | null; email: string | null }) {
  if (!phone && !email) return <span className="text-slate-300">—</span>;

  let cleanPhone = phone?.replace(/[^0-9]/g, "") || "";
  // Egyptian local numbers: replace leading 0 with country code 20
  if (cleanPhone.startsWith("0")) cleanPhone = "20" + cleanPhone.slice(1);

  return (
    <div className="flex items-center gap-1">
      {phone && (
        <a
          href={`https://wa.me/${cleanPhone}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-green-50 transition-colors text-green-600 hover:text-green-700"
          title="WhatsApp"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-blue-50 transition-colors text-blue-500 hover:text-blue-600"
          title="Email"
        >
          <Mail className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}

export function PlayersTableView(props: PlayersTableProps) {
  const {
    players, selectedIds, toggleSelect, toggleSelectAll, allPageSelected,
    selectAllRef, getRowId, isHighlighted, sortField, sortDir, toggleSort,
    hasActiveFilters, onPlayerClick, onLevelChange, changingLevelId,
  } = props;

  const emptyMessage = hasActiveFilters ? "No players match your filters" : "No players found";

  const selectionMode = selectedIds.size > 0;

  function handleRowClick(e: React.MouseEvent, player: PlayerRow) {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, a, select")) return;
    if (selectionMode) {
      toggleSelect(player.id);
    } else {
      onPlayerClick(player);
    }
  }

  return (
    <>
      {/* Desktop Table */}
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {/* Sticky left */}
                <th className="sticky left-0 z-20 bg-white px-4 py-3 w-12 border-b border-slate-200">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="table-checkbox"
                  />
                </th>
                <th
                  className={cn(thSortable, "sticky left-12 z-20 bg-white min-w-[150px] border-r border-r-slate-200")}
                  onClick={() => toggleSort("name")}
                >
                  <span className="inline-flex items-center gap-1">Player <SortIcon field="name" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                {/* Scrollable middle */}
                <th className={thSortable} onClick={() => toggleSort("group")}>
                  <span className="inline-flex items-center gap-1">Group <SortIcon field="group" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thSortable} onClick={() => toggleSort("package")}>
                  <span className="inline-flex items-center gap-1">Package <SortIcon field="package" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thSortable} onClick={() => toggleSort("sessions")}>
                  <span className="inline-flex items-center gap-1">Sessions <SortIcon field="sessions" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thSortable} onClick={() => toggleSort("expires")}>
                  <span className="inline-flex items-center gap-1">Expires <SortIcon field="expires" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thSortable} onClick={() => toggleSort("level")}>
                  <span className="inline-flex items-center gap-1">Level <SortIcon field="level" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Health Conditions</th>
                <th className={thSortable} onClick={() => toggleSort("date")}>
                  <span className="inline-flex items-center gap-1">Registered <SortIcon field="date" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                {/* Sticky right group */}
                <th className={cn(thSortable, "sticky right-[128px] z-20 bg-white border-l border-l-slate-200")} onClick={() => toggleSort("subscription")}>
                  <span className="inline-flex items-center gap-1">Subscription <SortIcon field="subscription" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={cn(thSortable, "sticky right-[72px] z-20 bg-white !px-2 w-14 text-center")} onClick={() => toggleSort("activity")}>
                  <span className="inline-flex items-center gap-1">Active <SortIcon field="activity" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={cn(thBase, "sticky right-0 z-20 bg-white")}>
                  Contact
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => {
                const latestSub = getLatestSubscription(player);
                const activity = getActivityStatus(player);
                const subStatus = getSubscriptionStatus(player);
                const isSingleSession = latestSub?.sessions_total === 1;
                const highlighted = isHighlighted(player.id);
                const selected = selectedIds.has(player.id);
                const rowBg = selected ? "bg-primary-100" : highlighted ? "bg-cyan-50" : "bg-white";
                const daysLeft = !isSingleSession && latestSub ? getDaysLeft(latestSub.end_date) : null;
                const showExpiryWarning = daysLeft !== null;
                return (
                  <tr
                    key={player.id}
                    id={getRowId(player.id)}
                    onClick={(e) => handleRowClick(e, player)}
                    className={cn(
                      "group cursor-pointer hover:bg-primary-50 transition-colors",
                      selected && "bg-primary-100 hover:bg-primary-100",
                                            highlighted && "row-highlight"
                    )}
                  >
                    {/* Sticky left: checkbox */}
                    <td className={cn(tdBase, "sticky left-0 z-10 w-12 transition-colors", selected ? "group-hover:bg-primary-100" : "group-hover:bg-primary-50", rowBg)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(player.id)}
                        className="table-checkbox"
                      />
                    </td>
                    {/* Sticky left: player */}
                    <td className={cn(tdBase, "sticky left-12 z-10 min-w-[150px] border-r border-r-slate-100 transition-colors", selected ? "group-hover:bg-primary-100" : "group-hover:bg-primary-50", rowBg)}>
                      <p className="text-sm font-medium text-slate-900">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-xs text-slate-400 truncate max-w-[200px]">{player.email}</p>
                    </td>
                    {/* Scrollable middle */}
                    <td className={cn(tdBase, "text-sm text-slate-700 whitespace-nowrap")}>
                      {player.groups?.length
                        ? player.groups.map((g) => g.name).join(", ")
                        : "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700 whitespace-nowrap")}>
                      {latestSub?.packages?.name || "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {latestSub ? (latestSub.sessions_total === 1 ? latestSub.sessions_remaining : `${latestSub.sessions_remaining}/${latestSub.sessions_total}`) : "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm whitespace-nowrap")}>
                      {isSingleSession ? "—" : latestSub?.end_date ? (
                        <div>
                          <span className={cn(
                            showExpiryWarning && daysLeft! <= 3 ? "text-red-600 font-medium" :
                            showExpiryWarning && daysLeft! <= 7 ? "text-amber-600 font-medium" :
                            "text-slate-500"
                          )}>
                            {formatDate(latestSub.end_date)}
                          </span>
                          {showExpiryWarning && daysLeft! <= 7 && (
                            <p className={cn(
                              "text-xs mt-0.5",
                              daysLeft! <= 3 ? "text-red-500" : "text-amber-500"
                            )}>
                              {daysLeft! <= 0 ? "Expired" : `${daysLeft}d left`}
                            </p>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className={tdBase}>
                      <LevelSelect
                        playerId={player.id}
                        currentLevel={player.playing_level}
                        onLevelChange={onLevelChange}
                        isChanging={changingLevelId === player.id}
                      />
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700 max-w-[200px]")}>
                      {player.health_conditions ? (
                        <span className="truncate block" title={player.health_conditions}>
                          {player.health_conditions}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-500 whitespace-nowrap")}>
                      {formatDate(player.created_at)}
                    </td>
                    {/* Sticky right group: subscription + activity + contact */}
                    <td className={cn(tdBase, "sticky right-[128px] z-10 border-l border-l-slate-100 transition-colors", selected ? "group-hover:bg-primary-100" : "group-hover:bg-primary-50", rowBg)}>
                      <SubscriptionBadge status={subStatus} />
                    </td>
                    <td className={cn(tdBase, "sticky right-[72px] z-10 !px-2 w-14 text-center transition-colors", selected ? "group-hover:bg-primary-100" : "group-hover:bg-primary-50", rowBg)}>
                      <ActivityIcon status={activity} />
                    </td>
                    <td className={cn(tdBase, "sticky right-0 z-10 transition-colors", selected ? "group-hover:bg-primary-100" : "group-hover:bg-primary-50", rowBg)}>
                      <ContactIcons phone={player.phone} email={player.email} />
                    </td>
                  </tr>
                );
              })}
              {players.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-400 border-b border-slate-100">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-2">
        {players.map((player) => {
          const latestSub = getLatestSubscription(player);
          const activity = getActivityStatus(player);
          const subStatus = getSubscriptionStatus(player);
          const isSingleSession = latestSub?.sessions_total === 1;
          const selected = selectedIds.has(player.id);
          const daysLeft = !isSingleSession && latestSub ? getDaysLeft(latestSub.end_date) : null;
          const showExpiryWarning = daysLeft !== null;
          const isInactive = activity === "inactive";
          return (
            <div
              key={player.id}
              id={getRowId(player.id)}
              onClick={(e: React.MouseEvent) => handleRowClick(e, player)}
              className={cn(
                "rounded-xl border bg-white p-3.5 cursor-pointer transition-all",
                selected ? "border-primary-300 bg-primary-50 shadow-sm" : "border-slate-150 hover:border-primary-200 hover:shadow-sm",
                isHighlighted(player.id) && "row-highlight",
                isInactive && "opacity-60"
              )}
            >
              {/* Header: checkbox + avatar + name + badges */}
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(player.id)}
                  className="table-checkbox shrink-0"
                />
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  isInactive ? "bg-slate-100 text-slate-400" : "bg-primary/10 text-primary"
                )}>
                  {player.first_name[0]}{player.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {player.first_name} {player.last_name}
                    </p>
                    <ActivityIcon status={activity} />
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{player.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ContactIcons phone={player.phone} email={player.email} />
                </div>
              </div>

              {/* Info row */}
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
                {player.groups?.length ? (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Users className="w-3 h-3 text-slate-400" />
                    {player.groups.map((g) => g.name).join(", ")}
                  </span>
                ) : null}
                {latestSub?.packages?.name && (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Package className="w-3 h-3 text-slate-400" />
                    {latestSub.packages.name}
                  </span>
                )}
                {player.playing_level && (
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Dumbbell className="w-3 h-3 text-slate-400" />
                    {player.playing_level.charAt(0).toUpperCase() + player.playing_level.slice(1)}
                  </span>
                )}
              </div>

              {/* Bottom row: subscription + sessions + expiry */}
              <div className="mt-2.5 flex items-center justify-between">
                <SubscriptionBadge status={subStatus} />
                <div className="flex items-center gap-3 text-[11px]">
                  {latestSub && (
                    <span className="text-slate-600 font-medium">
                      {latestSub.sessions_total === 1
                        ? `${latestSub.sessions_remaining} session`
                        : `${latestSub.sessions_remaining}/${latestSub.sessions_total}`}
                    </span>
                  )}
                  {!isSingleSession && latestSub?.end_date && (
                    <span className={cn(
                      "inline-flex items-center gap-0.5",
                      showExpiryWarning && daysLeft! <= 3 ? "text-red-500 font-medium" :
                      showExpiryWarning && daysLeft! <= 7 ? "text-amber-500 font-medium" :
                      "text-slate-400"
                    )}>
                      <CalendarDays className="w-3 h-3" />
                      {formatDate(latestSub.end_date)}
                      {showExpiryWarning && daysLeft! <= 7 && (
                        <span className="ml-0.5">({daysLeft! <= 0 ? "Exp" : `${daysLeft}d`})</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {players.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">{emptyMessage}</p>
        )}
      </div>
    </>
  );
}
