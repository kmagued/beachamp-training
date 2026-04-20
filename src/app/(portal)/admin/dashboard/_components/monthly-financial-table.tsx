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
      <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2 mb-4">
        <Receipt className="w-5 h-5 text-secondary" />
        Monthly Financial Summary
      </h2>

      {data.length === 0 ? (
        <p className="text-sm text-primary-700/50 text-center py-8">No financial data yet</p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary-100">
                <th className="text-left py-2.5 pr-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">Month</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">Income</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">Expenses</th>
                <th className="text-right py-2.5 pl-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">Profit</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.key} className="border-b border-primary-100/60 last:border-0">
                  <td className="py-2.5 pr-4 text-primary-800 font-medium whitespace-nowrap">{row.month}</td>
                  <td className="py-2.5 px-4 text-right text-primary-800 tabular-nums whitespace-nowrap">{fmt(row.income)}</td>
                  <td className="py-2.5 px-4 text-right text-primary-800 tabular-nums whitespace-nowrap">{fmt(row.expenses)}</td>
                  <td className={cn(
                    "py-2.5 pl-4 text-right font-semibold tabular-nums whitespace-nowrap",
                    row.profit >= 0 ? "text-success" : "text-danger"
                  )}>
                    {fmt(row.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary-200">
                <td className="py-3 pr-4 font-bold text-primary-900">Total</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900 tabular-nums whitespace-nowrap">{fmt(totalIncome)}</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900 tabular-nums whitespace-nowrap">{fmt(totalExpenses)}</td>
                <td className={cn(
                  "py-3 pl-4 text-right font-bold tabular-nums whitespace-nowrap",
                  totalProfit >= 0 ? "text-success" : "text-danger"
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
