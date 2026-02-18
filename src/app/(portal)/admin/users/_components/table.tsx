import { RefObject, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Card, Badge } from "@/components/ui";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, EllipsisVertical } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { UserRow, SortField, SortDir } from "./types";
import type { UserRole } from "@/types/database";

interface UsersTableProps {
  users: UserRow[];
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
  onRoleChange: (userId: string, newRole: UserRole) => void;
  changingRoleId: string | null;
  currentUserId: string;
  onRowClick: (user: UserRow) => void;
}

const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200";
const thSortable = `${thBase} cursor-pointer select-none hover:text-slate-600 transition-colors`;
const tdBase = "px-4 py-3 border-b border-slate-100 whitespace-nowrap";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function RoleBadge({ role }: { role: UserRole }) {
  switch (role) {
    case "admin": return <Badge variant="danger">Admin</Badge>;
    case "coach": return <Badge variant="info">Coach</Badge>;
    default: return <Badge variant="neutral">Player</Badge>;
  }
}

function RoleSelect({
  userId,
  currentRole,
  onRoleChange,
  isChanging,
  isSelf,
}: {
  userId: string;
  currentRole: UserRole;
  onRoleChange: (userId: string, newRole: UserRole) => void;
  isChanging: boolean;
  isSelf: boolean;
}) {
  if (isSelf) {
    return <RoleBadge role={currentRole} />;
  }

  return (
    <div className="relative inline-flex items-center">
      {isChanging ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : (
        <select
          value={currentRole}
          onChange={(e) => {
            const newRole = e.target.value as UserRole;
            if (newRole === currentRole) return;
            if (newRole === "admin" || currentRole === "admin") {
              const confirmed = window.confirm(
                `Are you sure you want to change this user's role ${currentRole === "admin" ? "from" : "to"} Admin?`
              );
              if (!confirmed) {
                e.target.value = currentRole;
                return;
              }
            }
            onRoleChange(userId, newRole);
          }}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
        >
          <option value="player">Player</option>
          <option value="coach">Coach</option>
          <option value="admin">Admin</option>
        </select>
      )}
    </div>
  );
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

export function UsersTableView(props: UsersTableProps) {
  const {
    users, selectedIds, toggleSelect, toggleSelectAll, allPageSelected,
    selectAllRef, getRowId, isHighlighted, sortField, sortDir, toggleSort,
    hasActiveFilters, onRoleChange, changingRoleId, currentUserId, onRowClick,
  } = props;

  const selectionMode = selectedIds.size > 0;
  const emptyMessage = hasActiveFilters ? "No users match your filters" : "No users found";

  function handleRowClick(e: React.MouseEvent, user: UserRow) {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, a, select")) return;
    if (selectionMode) toggleSelect(user.id);
    else onRowClick(user);
  }

  return (
    <>
      {/* Desktop Table */}
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-white px-4 py-3 w-12 border-b border-slate-200">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    className="table-checkbox"
                  />
                </th>
                <th className={cn(thSortable, "sticky left-12 z-20 bg-white min-w-[150px] border-r border-r-slate-200")} onClick={() => toggleSort("name")}>
                  <span className="inline-flex items-center gap-1">Name <SortIcon field="name" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Email</th>
                <th className={thBase}>Phone</th>
                <th className={thBase}>Area</th>
                <th className={thSortable} onClick={() => toggleSort("role")}>
                  <span className="inline-flex items-center gap-1">Role <SortIcon field="role" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Status</th>
                <th className={thSortable} onClick={() => toggleSort("date")}>
                  <span className="inline-flex items-center gap-1">Registered <SortIcon field="date" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={cn(thBase, "sticky right-0 z-20 bg-white border-l border-l-slate-200 text-center")}>Contact</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => {
                const highlighted = isHighlighted(user.id);
                const selected = selectedIds.has(user.id);
                const rowBg = selected ? "bg-primary-100" : highlighted ? "bg-cyan-50" : i % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white";
                return (
                  <tr
                    key={user.id}
                    id={getRowId(user.id)}
                    onClick={(e) => handleRowClick(e, user)}
                    className={cn(
                      "group cursor-pointer hover:bg-primary-50 transition-colors",
                      selected && "bg-primary-100 hover:bg-primary-100",
                      !selected && i % 2 === 1 && "bg-[#FAFBFC]",
                      highlighted && "row-highlight"
                    )}
                  >
                    <td className={cn(tdBase, "sticky left-0 z-10 w-12 transition-colors group-hover:bg-primary-50", rowBg)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(user.id)}
                        className="table-checkbox"
                      />
                    </td>
                    <td className={cn(tdBase, "sticky left-12 z-10 min-w-[150px] border-r border-r-slate-100 transition-colors group-hover:bg-primary-50", rowBg)}>
                      <p className="text-sm font-medium text-slate-900">
                        {user.first_name} {user.last_name}
                      </p>
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {user.email || "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {user.phone || "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {user.area || "—"}
                    </td>
                    <td className={tdBase}>
                      <RoleSelect
                        userId={user.id}
                        currentRole={user.role}
                        onRoleChange={onRoleChange}
                        isChanging={changingRoleId === user.id}
                        isSelf={user.id === currentUserId}
                      />
                    </td>
                    <td className={tdBase}>
                      <Badge variant={user.is_active ? "success" : "neutral"}>
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-500")}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className={cn(tdBase, "sticky right-0 z-10 border-l border-l-slate-100 text-center transition-colors group-hover:bg-primary-50", rowBg)}>
                      <div className="flex justify-center">
                        <ContactMenu phone={user.phone} email={user.email} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
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
        {users.map((user) => {
          const selected = selectedIds.has(user.id);
          return (
          <Card
            key={user.id}
            id={getRowId(user.id)}
            onClick={(e: React.MouseEvent) => handleRowClick(e, user)}
            className={cn(
              "p-4 cursor-pointer hover:bg-primary-50 hover:border-primary-200 transition-colors",
              selected && "bg-primary-100 border-primary-200",
              isHighlighted(user.id) && "row-highlight"
            )}
          >
            <div className="flex items-start gap-3 mb-2">
              <input
                type="checkbox"
                checked={selectedIds.has(user.id)}
                onChange={() => toggleSelect(user.id)}
                className="table-checkbox mt-0.5"
              />
              <div className="flex items-start justify-between flex-1 min-w-0">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-slate-400">{user.email || "No email"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={user.is_active ? "success" : "neutral"}>
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <ContactMenu phone={user.phone} email={user.email} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <span className="text-slate-400">Role</span>
                <div className="mt-0.5">
                  <RoleSelect
                    userId={user.id}
                    currentRole={user.role}
                    onRoleChange={onRoleChange}
                    isChanging={changingRoleId === user.id}
                    isSelf={user.id === currentUserId}
                  />
                </div>
              </div>
              <div>
                <span className="text-slate-400">Phone</span>
                <p className="text-slate-700 font-medium">{user.phone || "—"}</p>
              </div>
              <div>
                <span className="text-slate-400">Area</span>
                <p className="text-slate-700 font-medium">{user.area || "—"}</p>
              </div>
              <div>
                <span className="text-slate-400">Registered</span>
                <p className="text-slate-700 font-medium">
                  {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </Card>
          );
        })}
        {users.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">{emptyMessage}</p>
        )}
      </div>
    </>
  );
}
