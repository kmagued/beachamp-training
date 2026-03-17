import { useMemo } from "react";
import { Card } from "@/components/ui";
import type { ExpenseRow, CategoryRow } from "./types";

interface CategoryReportProps {
  expenses: ExpenseRow[];
  categories: CategoryRow[];
}

export function CategoryReport({ expenses, categories }: CategoryReportProps) {
  const report = useMemo(() => {
    const byCategory: Record<string, { name: string; count: number; total: number }> = {};

    for (const expense of expenses) {
      const catName = expense.expense_categories?.name || "Uncategorized";
      const catId = expense.category_id;
      if (!byCategory[catId]) {
        byCategory[catId] = { name: catName, count: 0, total: 0 };
      }
      byCategory[catId].count += 1;
      byCategory[catId].total += expense.amount;
    }

    const rows = Object.values(byCategory).sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

    return { rows, grandTotal };
  }, [expenses]);

  if (report.rows.length === 0) {
    return (
      <p className="text-center text-sm text-slate-400 py-8">No expenses to report</p>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                Category
              </th>
              <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                Count
              </th>
              <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                Total
              </th>
              <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 border-b border-slate-200">
                % of Total
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const pct = report.grandTotal > 0
                ? Math.round((row.total / report.grandTotal) * 100)
                : 0;
              return (
                <tr key={row.name} className="hover:bg-primary-50 transition-colors">
                  <td className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-700">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 border-b border-slate-100 text-sm text-slate-500 text-right">
                    {row.count}
                  </td>
                  <td className="px-4 py-3 border-b border-slate-100 text-sm text-slate-700 font-medium text-right">
                    {row.total.toLocaleString()} EGP
                  </td>
                  <td className="px-4 py-3 border-b border-slate-100 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total
              </td>
              <td className="px-4 py-3 text-sm text-slate-500 text-right font-medium">
                {report.rows.reduce((sum, r) => sum + r.count, 0)}
              </td>
              <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">
                {report.grandTotal.toLocaleString()} EGP
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
