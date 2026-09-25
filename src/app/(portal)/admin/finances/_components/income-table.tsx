import { Card } from "@/components/ui";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format-date";
import type { IncomeRow } from "./types";

interface IncomeTableProps {
  income: IncomeRow[];
  onEdit: (income: IncomeRow) => void;
  onDelete: (id: string) => void;
  grandTotal: number;
}

const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200";
const tdBase = "px-4 py-3 border-b border-slate-100 whitespace-nowrap";

export function IncomeTableView({ income, onEdit, onDelete, grandTotal }: IncomeTableProps) {
  return (
    <>
      {/* Desktop Table */}
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={thBase}>Date</th>
                <th className={thBase}>Category</th>
                <th className={thBase}>Description</th>
                <th className={thBase}>Amount</th>
                <th className={cn(thBase, "text-center")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {income.map((item) => (
                <tr key={item.id} className="group hover:bg-primary-50 transition-colors">
                  <td className={cn(tdBase, "text-sm text-slate-700")}>
                    {formatDate(item.income_date)}
                  </td>
                  <td className={cn(tdBase, "text-sm text-slate-700")}>
                    {item.income_categories?.name || "—"}
                  </td>
                  <td className={cn(tdBase, "text-sm text-slate-900 font-medium max-w-[250px] truncate")}>
                    {item.description || "—"}
                    {item.notes && (
                      <span className="block text-xs text-slate-400 truncate">{item.notes}</span>
                    )}
                  </td>
                  <td className={cn(tdBase, "text-sm font-medium text-emerald-600")}>
                    +{item.amount.toLocaleString()} EGP
                  </td>
                  <td className={cn(tdBase, "text-center")}>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onEdit(item)}
                        className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {income.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400 border-b border-slate-100">
                    No income recorded yet
                  </td>
                </tr>
              )}
            </tbody>
            {income.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50">
                  <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Total
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" colSpan={2} />
                  <td className="px-4 py-3 text-sm font-bold text-emerald-700 whitespace-nowrap">
                    +{grandTotal.toLocaleString()} EGP
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {income.map((item) => (
          <Card key={item.id} className="p-4 hover:bg-primary-50 hover:border-primary-200 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.description || item.income_categories?.name}</p>
                <p className="text-xs text-slate-400">{item.income_categories?.name || "—"}</p>
              </div>
              <p className="text-sm font-semibold text-emerald-600">+{item.amount.toLocaleString()} EGP</p>
            </div>
            <p className="text-xs text-slate-500">{formatDate(item.income_date)}</p>
            {item.notes && (
              <p className="mt-2 text-xs text-slate-400 truncate">{item.notes}</p>
            )}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => onEdit(item)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors text-xs font-medium"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-xs font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </Card>
        ))}
        {income.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold text-emerald-700">+{grandTotal.toLocaleString()} EGP</span>
          </div>
        )}
        {income.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">No income recorded yet</p>
        )}
      </div>
    </>
  );
}
