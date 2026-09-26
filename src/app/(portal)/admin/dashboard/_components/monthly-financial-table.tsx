"use client";

import { useMemo, useState } from "react";
import { Card, Select } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { Receipt } from "lucide-react";

interface MonthlyRow {
  month: string;
  key: string;
  income: number;
  expenses: number;
  /** Court rental expenses — the slice of `expenses` filed under "Court Reservation" */
  rentals: number;
  profit: number;
  /** Profit with court rental expenses added back in */
  profitExRentals: number;
}

const ALL_YEARS = "all";

/**
 * The five columns do not fit a phone, so the table scrolls sideways there.
 * Pinning the first column keeps the month label readable while the figures move.
 */
const STICKY = "sticky left-0 z-10 bg-white border-r border-primary-100/60 sm:border-r-0";
/** Headers wrap so the columns stay narrow; figures never wrap. */
const TH = "py-2 sm:py-2.5 text-right text-[10px] sm:text-xs font-semibold text-primary-700/50 uppercase tracking-wider";
const TD = "py-2 sm:py-2.5 text-right tabular-nums whitespace-nowrap";

export function MonthlyFinancialTable({ data }: { data: MonthlyRow[] }) {
  const years = useMemo(
    () => Array.from(new Set(data.map((r) => r.key.slice(0, 4)))).sort((a, b) => b.localeCompare(a)),
    [data],
  );
  // One year at a time keeps the table at 12 rows at most; "All years" rolls months up per year
  const [period, setPeriod] = useState(years[0] ?? ALL_YEARS);
  const isAllYears = period === ALL_YEARS;

  const rows = useMemo(() => {
    if (!isAllYears) return data.filter((r) => r.key.startsWith(period));
    const byYear = new Map<string, MonthlyRow>();
    for (const r of data) {
      const year = r.key.slice(0, 4);
      const entry = byYear.get(year) ?? { month: year, key: year, income: 0, expenses: 0, rentals: 0, profit: 0, profitExRentals: 0 };
      entry.income += r.income;
      entry.expenses += r.expenses;
      entry.rentals += r.rentals;
      entry.profit += r.profit;
      entry.profitExRentals += r.profitExRentals;
      byYear.set(year, entry);
    }
    return [...byYear.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [data, period, isAllYears]);

  const totalIncome = rows.reduce((s, r) => s + r.income, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalRentals = rows.reduce((s, r) => s + r.rentals, 0);
  const totalProfit = totalIncome - totalExpenses;
  const totalProfitExRentals = rows.reduce((s, r) => s + r.profitExRentals, 0);

  // Currency sits in the column headers rather than on every figure
  const fmt = (n: number) => n.toLocaleString();

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-2xl tracking-wide text-primary-900 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-secondary" />
          Monthly Financial Summary
        </h2>
        {years.length > 0 && (
          <Select
            aria-label="Year"
            size="sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-auto sm:min-w-32 border-slate-200 text-sm"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
            <option value={ALL_YEARS}>All years</option>
          </Select>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-primary-700/50 text-center py-8">No financial data yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-primary-100">
                <th className={cn(STICKY, "text-left py-2 sm:py-2.5 pr-3 sm:pr-4 text-[10px] sm:text-xs font-semibold text-primary-700/50 uppercase tracking-wider")}>
                  {isAllYears ? "Year" : "Month"}
                </th>
                <th className={cn(TH, "px-3 sm:px-4")}>Income (EGP)</th>
                <th className={cn(TH, "px-3 sm:px-4")}>Expenses (EGP)</th>
                <th className={cn(TH, "px-3 sm:px-4")}>Profit (EGP)</th>
                <th className={cn(TH, "pl-3 sm:pl-4")}>Profit excl. Rentals (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-primary-100/60 last:border-0">
                  <td className={cn(STICKY, "py-2 sm:py-2.5 pr-3 sm:pr-4 text-primary-800 font-medium whitespace-nowrap")}>
                    {row.month}
                  </td>
                  <td className={cn(TD, "px-3 sm:px-4 text-primary-800")}>{fmt(row.income)}</td>
                  <td className={cn(TD, "px-3 sm:px-4 text-primary-800")}>
                    {fmt(row.expenses)}
                    {row.rentals > 0 && (
                      <span className="block sm:inline text-primary-700/50"> ({fmt(row.rentals)} rentals)</span>
                    )}
                  </td>
                  <td className={cn(TD, "px-3 sm:px-4 font-semibold", row.profit >= 0 ? "text-success" : "text-danger")}>
                    {fmt(row.profit)}
                  </td>
                  <td className={cn(TD, "pl-3 sm:pl-4 font-semibold", row.profitExRentals >= 0 ? "text-success" : "text-danger")}>
                    {fmt(row.profitExRentals)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary-200">
                <td className={cn(STICKY, "py-3 pr-3 sm:pr-4 font-bold text-primary-900 whitespace-nowrap")}>
                  {isAllYears ? "Total" : `${period} total`}
                </td>
                <td className={cn(TD, "py-3 px-3 sm:px-4 font-bold text-primary-900")}>{fmt(totalIncome)}</td>
                <td className={cn(TD, "py-3 px-3 sm:px-4 font-bold text-primary-900")}>
                  {fmt(totalExpenses)}
                  {totalRentals > 0 && (
                    <span className="block sm:inline font-medium text-primary-700/50"> ({fmt(totalRentals)} rentals)</span>
                  )}
                </td>
                <td className={cn(TD, "py-3 px-3 sm:px-4 font-bold", totalProfit >= 0 ? "text-success" : "text-danger")}>
                  {fmt(totalProfit)}
                </td>
                <td className={cn(TD, "py-3 pl-3 sm:pl-4 font-bold", totalProfitExRentals >= 0 ? "text-success" : "text-danger")}>
                  {fmt(totalProfitExRentals)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
