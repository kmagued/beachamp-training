import { RefObject } from "react";
import { Card, Badge } from "@/components/ui";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PlayerRow, SortField, SortDir } from "./types";
import { getPlayerStatus } from "./types";

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
}

const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200";
const thSortable = `${thBase} cursor-pointer select-none hover:text-slate-600 transition-colors`;
const tdBase = "px-4 py-3 border-b border-slate-100";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active": return <Badge variant="success">Active</Badge>;
    case "expiring": return <Badge variant="warning">Expiring</Badge>;
    case "pending": return <Badge variant="warning">Pending</Badge>;
    default: return <Badge variant="neutral">Inactive</Badge>;
  }
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return <Badge variant="neutral">—</Badge>;
  switch (level) {
    case "beginner": return <Badge variant="info">Beginner</Badge>;
    case "intermediate": return <Badge variant="info">Intermediate</Badge>;
    case "advanced": return <Badge variant="success">Advanced</Badge>;
    case "professional": return <Badge variant="success">Professional</Badge>;
    default: return <Badge variant="neutral">{level}</Badge>;
  }
}

export function PlayersTableView(props: PlayersTableProps) {
  const {
    players, selectedIds, toggleSelect, toggleSelectAll, allPageSelected,
    selectAllRef, getRowId, isHighlighted, sortField, sortDir, toggleSort,
    hasActiveFilters,
  } = props;

  const emptyMessage = hasActiveFilters ? "No players match your filters" : "No players found";

  return (
    <>
      {/* Desktop Table */}
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
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
                <th className={cn(thBase, "sticky left-12 z-20 bg-white min-w-[150px] border-r border-r-slate-200")}>
                  Player
                </th>
                {/* Scrollable middle */}
                <th className={thSortable} onClick={() => toggleSort("package")}>
                  <span className="inline-flex items-center gap-1">Package <SortIcon field="package" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Sessions</th>
                <th className={thBase}>Expires</th>
                <th className={thSortable} onClick={() => toggleSort("level")}>
                  <span className="inline-flex items-center gap-1">Level <SortIcon field="level" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thSortable} onClick={() => toggleSort("date")}>
                  <span className="inline-flex items-center gap-1">Registered <SortIcon field="date" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                {/* Sticky right */}
                <th className={cn(thBase, "sticky right-0 z-20 bg-white border-l border-l-slate-200")}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => {
                const activeSub = player.subscriptions?.find((s) => s.status === "active");
                const status = getPlayerStatus(player);
                const highlighted = isHighlighted(player.id);
                const rowBg = highlighted ? "bg-cyan-50" : i % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white";
                return (
                  <tr
                    key={player.id}
                    id={getRowId(player.id)}
                    className={cn(
                      i % 2 === 1 && "bg-[#FAFBFC]",
                      highlighted && "row-highlight"
                    )}
                  >
                    {/* Sticky left: checkbox */}
                    <td className={cn(tdBase, "sticky left-0 z-10 w-12", rowBg)}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(player.id)}
                        onChange={() => toggleSelect(player.id)}
                        className="table-checkbox"
                      />
                    </td>
                    {/* Sticky left: player */}
                    <td className={cn(tdBase, "sticky left-12 z-10 min-w-[150px] border-r border-r-slate-100", rowBg)}>
                      <p className="text-sm font-medium text-slate-900">
                        {player.first_name} {player.last_name}
                      </p>
                      <p className="text-xs text-slate-400">{player.email}</p>
                    </td>
                    {/* Scrollable middle */}
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {activeSub?.packages?.name || "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {activeSub
                        ? `${activeSub.sessions_remaining}/${activeSub.sessions_total}`
                        : "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-500")}>
                      {activeSub?.end_date
                        ? new Date(activeSub.end_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className={tdBase}>
                      <LevelBadge level={player.playing_level} />
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-500")}>
                      {new Date(player.created_at).toLocaleDateString()}
                    </td>
                    {/* Sticky right: status */}
                    <td className={cn(tdBase, "sticky right-0 z-10 border-l border-l-slate-100", rowBg)}>
                      <StatusBadge status={status} />
                    </td>
                  </tr>
                );
              })}
              {players.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400 border-b border-slate-100">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {players.map((player) => {
          const activeSub = player.subscriptions?.find((s) => s.status === "active");
          const status = getPlayerStatus(player);
          return (
            <Card
              key={player.id}
              id={getRowId(player.id)}
              className={cn("p-4", isHighlighted(player.id) && "row-highlight")}
            >
              <div className="flex items-start gap-3 mb-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(player.id)}
                  onChange={() => toggleSelect(player.id)}
                  className="table-checkbox mt-0.5"
                />
                <div className="flex items-start justify-between flex-1 min-w-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {player.first_name} {player.last_name}
                    </p>
                    <p className="text-xs text-slate-400">{player.email}</p>
                  </div>
                  <StatusBadge status={status} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div>
                  <span className="text-slate-400">Package</span>
                  <p className="text-slate-700 font-medium">{activeSub?.packages?.name || "—"}</p>
                </div>
                <div>
                  <span className="text-slate-400">Sessions</span>
                  <p className="text-slate-700 font-medium">
                    {activeSub ? `${activeSub.sessions_remaining}/${activeSub.sessions_total}` : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Expires</span>
                  <p className="text-slate-700 font-medium">
                    {activeSub?.end_date ? new Date(activeSub.end_date).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Level</span>
                  <div className="mt-0.5"><LevelBadge level={player.playing_level} /></div>
                </div>
                <div>
                  <span className="text-slate-400">Registered</span>
                  <p className="text-slate-700 font-medium">
                    {new Date(player.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
        {players.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">{emptyMessage}</p>
        )}
      </div>
    </>
  );
}
