import { RefObject, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Card, Badge } from "@/components/ui";
import { ArrowUpDown, ArrowUp, ArrowDown, EllipsisVertical } from "lucide-react";
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
  onPlayerClick: (player: PlayerRow) => void;
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

function ContactMenu({ phone, email }: { phone: string | null; email: string | null }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const updatePos = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    function handleClick(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function handleScroll() { setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, updatePos]);

  if (!phone && !email) return <span className="text-slate-300">—</span>;

  const cleanPhone = phone?.replace(/[^0-9+]/g, "") || "";

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
      >
        <EllipsisVertical className="w-4 h-4" />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-[9999] min-w-[160px]"
        >
          {phone && (
            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4 text-green-600" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Email
            </a>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export function PlayersTableView(props: PlayersTableProps) {
  const {
    players, selectedIds, toggleSelect, toggleSelectAll, allPageSelected,
    selectAllRef, getRowId, isHighlighted, sortField, sortDir, toggleSort,
    hasActiveFilters, onPlayerClick,
  } = props;

  const emptyMessage = hasActiveFilters ? "No players match your filters" : "No players found";

  const selectionMode = selectedIds.size > 0;

  function handleRowClick(e: React.MouseEvent, player: PlayerRow) {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, a")) return;
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
                <th className={thBase}>Health Conditions</th>
                <th className={thSortable} onClick={() => toggleSort("date")}>
                  <span className="inline-flex items-center gap-1">Registered <SortIcon field="date" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                {/* Sticky right */}
                <th className={cn(thBase, "sticky right-0 z-20 bg-white border-l border-l-slate-200")}>
                  <div className="flex items-center gap-3 justify-between">
                    <span>Status</span>
                    <span>Contact</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player, i) => {
                const activeSub = player.subscriptions?.find((s) => s.status === "active");
                const status = getPlayerStatus(player);
                const highlighted = isHighlighted(player.id);
                const selected = selectedIds.has(player.id);
                const rowBg = selected ? "bg-primary-100" : highlighted ? "bg-cyan-50" : i % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white";
                return (
                  <tr
                    key={player.id}
                    id={getRowId(player.id)}
                    onClick={(e) => handleRowClick(e, player)}
                    className={cn(
                      "group cursor-pointer hover:bg-primary-50 transition-colors",
                      selected && "bg-primary-100 hover:bg-primary-100",
                      !selected && i % 2 === 1 && "bg-[#FAFBFC]",
                      highlighted && "row-highlight"
                    )}
                  >
                    {/* Sticky left: checkbox */}
                    <td className={cn(tdBase, "sticky left-0 z-10 w-12 transition-colors group-hover:bg-primary-50", rowBg)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(player.id)}
                        className="table-checkbox"
                      />
                    </td>
                    {/* Sticky left: player */}
                    <td className={cn(tdBase, "sticky left-12 z-10 min-w-[150px] border-r border-r-slate-100 transition-colors group-hover:bg-primary-50", rowBg)}>
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
                    <td className={cn(tdBase, "text-sm text-slate-700 max-w-[200px]")}>
                      {player.health_conditions ? (
                        <span className="truncate block" title={player.health_conditions}>
                          {player.health_conditions}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-500")}>
                      {new Date(player.created_at).toLocaleDateString()}
                    </td>
                    {/* Sticky right: status + contact */}
                    <td className={cn(tdBase, "sticky right-0 z-10 border-l border-l-slate-100 transition-colors group-hover:bg-primary-50", rowBg)}>
                      <div className="flex items-center gap-3 justify-between">
                        <StatusBadge status={status} />
                        <ContactMenu phone={player.phone} email={player.email} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {players.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400 border-b border-slate-100">
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
          const selected = selectedIds.has(player.id);
          return (
            <Card
              key={player.id}
              id={getRowId(player.id)}
              onClick={(e: React.MouseEvent) => handleRowClick(e, player)}
              className={cn(
                "p-4 cursor-pointer hover:bg-primary-50 hover:border-primary-200 transition-colors",
                selected && "bg-primary-100 border-primary-200",
                isHighlighted(player.id) && "row-highlight"
              )}
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
                  <div className="flex items-center gap-2">
                    <StatusBadge status={status} />
                    <ContactMenu phone={player.phone} email={player.email} />
                  </div>
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
                {player.health_conditions && (
                  <div className="col-span-2">
                    <span className="text-slate-400">Health Conditions</span>
                    <p className="text-slate-700 font-medium">{player.health_conditions}</p>
                  </div>
                )}
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
