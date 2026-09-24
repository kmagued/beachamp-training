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

  const fmt = (n: number) => `${n.toLocaleString()} EGP`;

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
        <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary-100">
                <th className="text-left py-2.5 pr-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">{isAllYears ? "Year" : "Month"}</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">Income</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">Expenses</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider">Profit</th>
                <th className="text-right py-2.5 pl-4 text-xs font-semibold text-primary-700/50 uppercase tracking-wider whitespace-nowrap">Profit excl. Rentals</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-primary-100/60 last:border-0">
                  <td className="py-2.5 pr-4 text-primary-800 font-medium whitespace-nowrap">{row.month}</td>
                  <td className="py-2.5 px-4 text-right text-primary-800 tabular-nums whitespace-nowrap">{fmt(row.income)}</td>
                  <td className="py-2.5 px-4 text-right text-primary-800 tabular-nums whitespace-nowrap">
                    {fmt(row.expenses)}
                    {row.rentals > 0 && (
                      <span className="text-primary-700/50"> ({fmt(row.rentals)} rentals)</span>
                    )}
                  </td>
                  <td className={cn(
                    "py-2.5 px-4 text-right font-semibold tabular-nums whitespace-nowrap",
                    row.profit >= 0 ? "text-success" : "text-danger"
                  )}>
                    {fmt(row.profit)}
                  </td>
                  <td className={cn(
                    "py-2.5 pl-4 text-right font-semibold tabular-nums whitespace-nowrap",
                    row.profitExRentals >= 0 ? "text-success" : "text-danger"
                  )}>
                    {fmt(row.profitExRentals)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary-200">
                <td className="py-3 pr-4 font-bold text-primary-900 whitespace-nowrap">{isAllYears ? "Total" : `${period} total`}</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900 tabular-nums whitespace-nowrap">{fmt(totalIncome)}</td>
                <td className="py-3 px-4 text-right font-bold text-primary-900 tabular-nums whitespace-nowrap">
                  {fmt(totalExpenses)}
                  {totalRentals > 0 && (
                    <span className="font-medium text-primary-700/50"> ({fmt(totalRentals)} rentals)</span>
                  )}
                </td>
                <td className={cn(
                  "py-3 px-4 text-right font-bold tabular-nums whitespace-nowrap",
                  totalProfit >= 0 ? "text-success" : "text-danger"
                )}>
                  {fmt(totalProfit)}
                </td>
                <td className={cn(
                  "py-3 pl-4 text-right font-bold tabular-nums whitespace-nowrap",
                  totalProfitExRentals >= 0 ? "text-success" : "text-danger"
                )}>
                  {fmt(totalProfitExRentals)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Mobile cards — the five columns do not fit a phone */}
      {data.length > 0 && (
        <div className="sm:hidden space-y-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded-xl border border-primary-100 p-4">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <p className="font-semibold text-primary-900">{row.month}</p>
                <p className={cn(
                  "text-base font-bold tabular-nums",
                  row.profit >= 0 ? "text-success" : "text-danger"
                )}>
                  {fmt(row.profit)}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider">Income</dt>
                  <dd className="text-primary-800 font-medium tabular-nums">{fmt(row.income)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider">Expenses</dt>
                  <dd className="text-primary-800 font-medium tabular-nums">
                    {fmt(row.expenses)}
                    {row.rentals > 0 && (
                      <span className="block font-normal text-primary-700/50">
                        ({fmt(row.rentals)} rentals)
                      </span>
                    )}
                  </dd>
                </div>
                <div className="col-span-2 pt-2 border-t border-primary-100/60">
                  <dt className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider">Profit excl. Rentals</dt>
                  <dd className={cn(
                    "font-semibold tabular-nums",
                    row.profitExRentals >= 0 ? "text-success" : "text-danger"
                  )}>
                    {fmt(row.profitExRentals)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}

          <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4">
            <p className="text-[11px] font-semibold text-primary-700/50 uppercase tracking-wider mb-2">
              {isAllYears ? "Total" : `${period} total`}
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-primary-700/50">Income</dt>
                <dd className="font-bold text-primary-900 tabular-nums">{fmt(totalIncome)}</dd>
              </div>
              <div>
                <dt className="text-primary-700/50">Expenses</dt>
                <dd className="font-bold text-primary-900 tabular-nums">
                  {fmt(totalExpenses)}
                  {totalRentals > 0 && (
                    <span className="block font-medium text-primary-700/50">
                      ({fmt(totalRentals)} rentals)
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-primary-700/50">Profit</dt>
                <dd className={cn(
                  "font-bold tabular-nums",
                  totalProfit >= 0 ? "text-success" : "text-danger"
                )}>
                  {fmt(totalProfit)}
                </dd>
              </div>
              <div>
                <dt className="text-primary-700/50">Excl. Rentals</dt>
                <dd className={cn(
                  "font-bold tabular-nums",
                  totalProfitExRentals >= 0 ? "text-success" : "text-danger"
                )}>
                  {fmt(totalProfitExRentals)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </Card>
  );
}
