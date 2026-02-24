import { Card } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { Receipt } from "lucide-react";

interface MonthlyRow {
  month: string;
  key: string;
  income: number;
  expenses: number;
  profit: number;
}

export function MonthlyFinancialTable({ data }: { data: MonthlyRow[] }) {
  const totalIncome = data.reduce((s, r) => s + r.income, 0);
  const totalExpenses = data.reduce((s, r) => s + r.expenses, 0);
  const totalProfit = totalIncome - totalExpenses;

  const fmt = (n: number) => `${n.toLocaleString()} EGP`;

  return (
    <Card>
      <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-slate-400" />
        Monthly Financial Summary
      </h2>

      {data.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No financial data yet</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2.5 pr-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Month</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Income</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Expenses</th>
                <th className="text-right py-2.5 pl-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-4 text-slate-700 font-medium whitespace-nowrap">{row.month}</td>
                  <td className="py-2.5 px-4 text-right text-slate-700 tabular-nums whitespace-nowrap">{fmt(row.income)}</td>
                  <td className="py-2.5 px-4 text-right text-slate-700 tabular-nums whitespace-nowrap">{fmt(row.expenses)}</td>
                  <td className={cn(
                    "py-2.5 pl-4 text-right font-medium tabular-nums whitespace-nowrap",
                    row.profit >= 0 ? "text-emerald-600" : "text-red-600"
                  )}>
                    {fmt(row.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200">
                <td className="py-3 pr-4 font-bold text-slate-900">Total</td>
                <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{fmt(totalIncome)}</td>
                <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">{fmt(totalExpenses)}</td>
                <td className={cn(
                  "py-3 pl-4 text-right font-bold tabular-nums whitespace-nowrap",
                  totalProfit >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {fmt(totalProfit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
