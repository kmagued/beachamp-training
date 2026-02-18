import { RefObject } from "react";
import { Card, Badge } from "@/components/ui";
import { Check, X, Image as ImageIcon, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { PaymentRow, SortField, SortDir } from "./types";

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
  search: string;
  statusFilter: string;
}

const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200";
const thSortable = `${thBase} cursor-pointer select-none hover:text-slate-600 transition-colors`;
const tdBase = "px-4 py-3 border-b border-slate-100";

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
    onConfirm, onReject, isPending, actionId, onViewScreenshot, search, statusFilter,
  } = props;

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
                const rowBg = highlighted ? "bg-cyan-50" : i % 2 === 1 ? "bg-[#FAFBFC]" : "bg-white";
                return (
                  <tr
                    key={payment.id}
                    id={getRowId(payment.id)}
                    className={cn(
                      i % 2 === 1 && "bg-[#FAFBFC]",
                      highlighted && "row-highlight"
                    )}
                  >
                    {/* Sticky left: checkbox */}
                    <td className={cn(tdBase, "sticky left-0 z-10 w-12", rowBg)}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(payment.id)}
                        onChange={() => toggleSelect(payment.id)}
                        className="table-checkbox"
                      />
                    </td>
                    {/* Sticky left: player */}
                    <td className={cn(tdBase, "sticky left-12 z-10 text-sm font-medium text-slate-900 min-w-[150px] border-r border-r-slate-100", rowBg)}>
                      {payment.profiles?.first_name} {payment.profiles?.last_name}
                    </td>
                    {/* Scrollable middle */}
                    <td className={cn(tdBase, "text-sm text-slate-700 whitespace-nowrap")}>
                      {payment.subscriptions?.packages?.name || "—"}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700")}>
                      {payment.amount.toLocaleString()} EGP
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-700 capitalize")}>
                      {payment.method.replace("_", " ")}
                    </td>
                    <td className={cn(tdBase, "text-sm text-slate-500")}>
                      {new Date(payment.created_at).toLocaleDateString()}
                    </td>
                    <td className={tdBase}>
                      <StatusBadge status={payment.status} />
                    </td>
                    <td className={cn(tdBase, "text-sm whitespace-nowrap")}>
                      {payment.status === "rejected" && payment.rejection_reason ? (
                        <span className="text-red-400 text-xs" title={payment.rejection_reason}>
                          {payment.rejection_reason}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    {/* Sticky right: screenshot + actions */}
                    <td className={cn(tdBase, "sticky right-0 z-10 border-l border-l-slate-100", rowBg)}>
                      <div className="flex items-center justify-center gap-1.5">
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
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {payments.map((payment) => (
          <Card
            key={payment.id}
            id={getRowId(payment.id)}
            className={cn("p-4", isHighlighted(payment.id) && "row-highlight")}
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
                  <p className="text-sm font-semibold text-slate-900">
                    {payment.profiles?.first_name} {payment.profiles?.last_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {payment.subscriptions?.packages?.name || "—"}
                  </p>
                </div>
                <StatusBadge status={payment.status} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div>
                <span className="text-slate-400">Amount</span>
                <p className="text-slate-700 font-medium">{payment.amount.toLocaleString()} EGP</p>
              </div>
              <div>
                <span className="text-slate-400">Method</span>
                <p className="text-slate-700 font-medium capitalize">{payment.method.replace("_", " ")}</p>
              </div>
              <div>
                <span className="text-slate-400">Date</span>
                <p className="text-slate-700 font-medium">{new Date(payment.created_at).toLocaleDateString()}</p>
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
        ))}
        {payments.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">{emptyMessage}</p>
        )}
      </div>
    </>
  );
}
