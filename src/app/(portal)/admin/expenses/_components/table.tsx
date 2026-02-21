import { Card, Badge } from "@/components/ui";
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Repeat } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ExpenseRow, SortField, SortDir } from "./types";

interface ExpensesTableProps {
  expenses: ExpenseRow[];
  sortField: SortField;
  sortDir: SortDir;
  toggleSort: (field: SortField) => void;
  onEdit: (expense: ExpenseRow) => void;
  onDelete: (id: string) => void;
  search: string;
  typeFilter: string;
}

const thBase = "text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200";
const thSortable = `${thBase} cursor-pointer select-none hover:text-slate-600 transition-colors`;
const tdBase = "px-4 py-3 border-b border-slate-100 whitespace-nowrap";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

export function ExpensesTableView(props: ExpensesTableProps) {
  const { expenses, sortField, sortDir, toggleSort, onEdit, onDelete, search, typeFilter } = props;

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const emptyMessage = search || typeFilter
    ? "No expenses match your filters"
    : "No expenses found";

  return (
    <>
      {/* Desktop Table */}
      <Card className="hidden sm:block overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={thSortable} onClick={() => toggleSort("date")}>
                  <span className="inline-flex items-center gap-1">Date <SortIcon field="date" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thSortable} onClick={() => toggleSort("category")}>
                  <span className="inline-flex items-center gap-1">Category <SortIcon field="category" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Description</th>
                <th className={thSortable} onClick={() => toggleSort("amount")}>
                  <span className="inline-flex items-center gap-1">Amount <SortIcon field="amount" sortField={sortField} sortDir={sortDir} /></span>
                </th>
                <th className={thBase}>Type</th>
                <th className={cn(thBase, "text-center")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="group hover:bg-primary-50 transition-colors"
                >
                  <td className={cn(tdBase, "text-sm text-slate-700")}>
                    {new Date(expense.expense_date).toLocaleDateString()}
                  </td>
                  <td className={cn(tdBase, "text-sm text-slate-700")}>
                    {expense.expense_categories?.name || "—"}
                  </td>
                  <td className={cn(tdBase, "text-sm text-slate-900 font-medium max-w-[250px] truncate")}>
                    {expense.description}
                    {expense.notes && (
                      <span className="block text-xs text-slate-400 truncate">{expense.notes}</span>
                    )}
                  </td>
                  <td className={cn(tdBase, "text-sm text-slate-700")}>
                    {expense.amount.toLocaleString()} EGP
                  </td>
                  <td className={tdBase}>
                    {expense.is_recurring ? (
                      <Badge variant="info" className="inline-flex items-center gap-1">
                        <Repeat className="w-3 h-3" />
                        {expense.recurrence_type === "monthly" ? "Monthly" : "Weekly"}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">One-time</Badge>
                    )}
                  </td>
                  <td className={cn(tdBase, "text-center")}>
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => onEdit(expense)}
                        className="p-1.5 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(expense.id)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400 border-b border-slate-100">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50">
                  <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Total
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" />
                  <td className="px-4 py-3 whitespace-nowrap" />
                  <td className="px-4 py-3 text-sm font-bold text-slate-900 whitespace-nowrap">
                    {total.toLocaleString()} EGP
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {expenses.map((expense) => (
          <Card
            key={expense.id}
            className="p-4 hover:bg-primary-50 hover:border-primary-200 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{expense.description}</p>
                <p className="text-xs text-slate-400">{expense.expense_categories?.name || "—"}</p>
              </div>
              {expense.is_recurring ? (
                <Badge variant="info" className="inline-flex items-center gap-1">
                  <Repeat className="w-3 h-3" />
                  {expense.recurrence_type === "monthly" ? "Monthly" : "Weekly"}
                </Badge>
              ) : (
                <Badge variant="neutral">One-time</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div>
                <span className="text-slate-400">Amount</span>
                <p className="text-slate-700 font-medium">{expense.amount.toLocaleString()} EGP</p>
              </div>
              <div>
                <span className="text-slate-400">Date</span>
                <p className="text-slate-700 font-medium">{new Date(expense.expense_date).toLocaleDateString()}</p>
              </div>
            </div>
            {expense.notes && (
              <p className="mt-2 text-xs text-slate-400 truncate">{expense.notes}</p>
            )}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => onEdit(expense)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors text-xs font-medium"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => onDelete(expense.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-xs font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </Card>
        ))}
        {expenses.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold text-slate-900">{total.toLocaleString()} EGP</span>
          </div>
        )}
        {expenses.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">{emptyMessage}</p>
        )}
      </div>
    </>
  );
}
