import { RefObject, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { Check, X, Image as ImageIcon, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format-date";
import { WhatsappSendDrawer } from "@/components/whatsapp/WhatsappSendDrawer";
import type { PaymentRow, SortField, SortDir } from "./types";

function WhatsAppButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
      title="Send WhatsApp"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    </button>
  );
}

interface PaymentsTableProps {
  payments: PaymentRow[];
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
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
  actionId: string | null;
  onViewScreenshot: (path: string) => void;
  onRowClick: (payment: PaymentRow) => void;
  search: string;
  statusFilter: string;
  grandTotal: number;
}

const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200";
const thSortable = `${thBase} cursor-pointer select-none hover:text-slate-600 transition-colors`;
const tdBase = "px-4 py-3 border-b border-slate-100 whitespace-nowrap";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "pending" ? "warning" : status === "confirmed" ? "success" : status === "rejected" ? "danger" : "neutral";
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

export function PaymentsTableView(props: PaymentsTableProps) {
  const {
    payments, selectedIds, toggleSelect, toggleSelectAll, allPageSelected,
    selectAllRef, getRowId, isHighlighted, sortField, sortDir, toggleSort,
    onConfirm, onReject, isPending, actionId, onViewScreenshot, onRowClick, search, statusFilter, grandTotal,
  } = props;

  const selectionMode = selectedIds.size > 0;

  const [waSendFor, setWaSendFor] = useState<{ id: string; name: string; phone: string | null } | null>(null);

  function openWhatsApp(payment: PaymentRow) {
    if (!payment.player_id || !payment.profiles) return;
    setWaSendFor({
      id: payment.player_id,
      name: `${payment.profiles.first_name} ${payment.profiles.last_name}`,
      phone: payment.profiles.phone,
    });
  }

  function handleRowClick(e: React.MouseEvent, payment: PaymentRow) {
    const target = e.target as HTMLElement;
    if (target.closest("input, button, a")) return;
    if (selectionMode) {
      toggleSelect(payment.id);
    } else {
      onRowClick(payment);
    }
  }

  const emptyMessage = search || statusFilter
    ? "No payments match your filters"
    : "No payments found";

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
                <th className={thBase}>Package</th>
                <th className={thSortable} onClick={() => toggleSort("amount")}>
                  <span className="inline-flex items-center gap-1">Amount <SortIcon field="amount" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Method</th>
                <th className={thSortable} onClick={() => toggleSort("date")}>
                  <span className="inline-flex items-center gap-1">Date <SortIcon field="date" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thSortable} onClick={() => toggleSort("status")}>
                  <span className="inline-flex items-center gap-1">Status <SortIcon field="status" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Reason</th>
                {/* Sticky right */}
                <th className={cn(thBase, "sticky right-0 z-20 bg-white border-l border-l-slate-200 text-center")}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, i) => {
                const highlighted = isHighlighted(payment.id);
                const selected = selectedIds.has(payment.id);
                const rowBg = selected ? "bg-primary-100" : highlighted ? "bg-cyan-50" : "bg-white";
                return (
                  <tr
                    key={payment.id}
                    id={getRowId(payment.id)}
                    onClick={(e) => handleRowClick(e, payment)}
                    className={cn(
                      "group cursor-pointer hover:bg-primary-50 transition-colors",
                      selected && "bg-primary-100 hover:bg-primary-100",
                                            highlighted && "row-highlight"
                    )}
                  >
                    {/* Sticky left: checkbox */}
                    <td className={cn(tdBase, "sticky left-0 z-10 w-12 transition-colors group-hover:bg-primary-50", rowBg)}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelect(payment.id)}
                        className="table-checkbox"
                      />
                    </td>
                    {/* Sticky left: player */}
                    <td className={cn(tdBase, "sticky left-12 z-10 text-sm font-medium min-w-[150px] border-r border-r-slate-100 transition-colors group-hover:bg-primary-50", rowBg, payment.profiles ? "text-slate-900" : "text-slate-500 italic")}>
                      {payment.profiles
                        ? `${payment.profiles.first_name} ${payment.profiles.last_name}`
                        : payment.note || "Single session"}
                    </td>
                    {/* Scrollable middle */}
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {payment.subscriptions?.packages?.name || (payment.profiles ? "—" : <Badge variant="neutral">Single</Badge>)}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {payment.amount.toLocaleString()} EGP
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700 capitalize")}>
                      {payment.method.replace("_", " ")}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-500")}>
                      {payment.confirmed_at ? formatDate(payment.confirmed_at) : "—"}
                    </td>
                    <td className={tdBase}>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className={cn(tdBase, "text-sm")}>
                      {payment.status === "rejected" && payment.rejection_reason ? (
                        <span className="text-red-400 text-xs" title={payment.rejection_reason}>
                          {payment.rejection_reason}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    {/* Sticky right: screenshot + actions */}
                    <td className={cn(tdBase, "sticky right-0 z-10 border-l border-l-slate-100 transition-colors group-hover:bg-primary-50", rowBg)}>
                      <div className="flex items-center justify-center gap-1.5">
                        {payment.player_id && payment.profiles && (
                          <WhatsAppButton onClick={() => openWhatsApp(payment)} />
                        )}
                        {payment.screenshot_url && (
                          <button
                            onClick={() => onViewScreenshot(payment.screenshot_url!)}
                            className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors"
                            title="View Screenshot"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                        )}
                        {payment.status === "pending" ? (
                          <>
                            <button
                              onClick={() => onConfirm(payment.id)}
                              disabled={isPending}
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                              title="Confirm"
                            >
                              {isPending && actionId === payment.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => onReject(payment.id)}
                              disabled={isPending}
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                              title="Reject"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : !payment.screenshot_url ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400 border-b border-slate-100">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
            {payments.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50">
                  <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 whitespace-nowrap" />
                  <td className="sticky left-12 z-10 bg-slate-50 px-4 py-3 border-r border-r-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Total
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" />
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 whitespace-nowrap">
                    {grandTotal.toLocaleString()} EGP
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" colSpan={4} />
                  <td className="sticky right-0 z-10 bg-slate-50 px-4 py-3 border-l border-l-slate-200 whitespace-nowrap" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {payments.map((payment) => {
          const selected = selectedIds.has(payment.id);
          return (
          <Card
            key={payment.id}
            id={getRowId(payment.id)}
            onClick={(e: React.MouseEvent) => handleRowClick(e, payment)}
            className={cn(
              "p-4 cursor-pointer hover:bg-primary-50 hover:border-primary-200 transition-colors",
              selected && "bg-primary-100 border-primary-200",
              isHighlighted(payment.id) && "row-highlight"
            )}
          >
            <div className="flex items-start gap-3 mb-2">
              <input
                type="checkbox"
                checked={selectedIds.has(payment.id)}
                onChange={() => toggleSelect(payment.id)}
                className="table-checkbox mt-0.5"
              />
              <div className="flex items-start justify-between flex-1 min-w-0">
                <div>
                  <p className={cn("text-sm font-semibold", payment.profiles ? "text-slate-900" : "text-slate-500 italic")}>
                    {payment.profiles
                      ? `${payment.profiles.first_name} ${payment.profiles.last_name}`
                      : payment.note || "Single session"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {payment.subscriptions?.packages?.name || (payment.profiles ? "—" : "Single session")}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {payment.player_id && payment.profiles && (
                    <WhatsAppButton onClick={() => openWhatsApp(payment)} />
                  )}
                  <StatusBadge status={payment.status} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <span className="text-slate-400">Amount</span>
                <p className="text-slate-700 font-medium">{payment.amount.toLocaleString()} EGP</p>
              </div>
              <div>
                <span className="text-slate-400">Method</span>
                <p className="text-slate-700 font-medium capitalize">{payment.method.replace("_", " ")}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <div>
                <span className="text-slate-400">Date</span>
                <p className="text-slate-700 font-medium">
                  {payment.confirmed_at ? formatDate(payment.confirmed_at) : "—"}
                </p>
              </div>
            </div>
            {payment.status === "rejected" && payment.rejection_reason && (
              <div className="mt-3 px-2.5 py-1.5 bg-red-50 rounded-lg text-[11px] text-red-500">
                <span className="font-medium">Reason:</span> {payment.rejection_reason}
              </div>
            )}
            {payment.screenshot_url && (
              <button
                onClick={() => onViewScreenshot(payment.screenshot_url!)}
                className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                <ImageIcon className="w-3.5 h-3.5" /> View Screenshot
              </button>
            )}
            {payment.status === "pending" && (
              <div className={`flex items-center gap-2 mt-3 ${!payment.screenshot_url ? "pt-3 border-t border-slate-100" : ""}`}>
                <button
                  onClick={() => onConfirm(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-xs font-medium disabled:opacity-50"
                >
                  {isPending && actionId === payment.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}{" "}
                  {isPending && actionId === payment.id ? "Confirming..." : "Confirm"}
                </button>
                <button
                  onClick={() => onReject(payment.id)}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-xs font-medium disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            )}
          </Card>
          );
        })}
        {payments.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold text-slate-900">{grandTotal.toLocaleString()} EGP</span>
          </div>
        )}
        {payments.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">{emptyMessage}</p>
        )}
      </div>

      <WhatsappSendDrawer
        open={waSendFor !== null}
        onClose={() => setWaSendFor(null)}
        playerId={waSendFor?.id ?? ""}
        playerName={waSendFor?.name ?? ""}
        playerPhone={waSendFor?.phone ?? null}
      />
    </>
  );
}
