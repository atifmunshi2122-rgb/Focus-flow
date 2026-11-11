import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { FinanceSummaryData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { BarChart2, PieChart, Layers } from 'lucide-react';

interface AnalyticsChartsProps {
  data: FinanceSummaryData;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ data }) => {
  const { currency } = useApp();

  // Income vs Expense comparison calculations
  const totalFlow = (data.totalIncomePaise || 0) + (data.totalExpensePaise || 0);
  const incomeRatio = totalFlow > 0 ? (data.totalIncomePaise / totalFlow) * 100 : 50;
  const expenseRatio = totalFlow > 0 ? (data.totalExpensePaise / totalFlow) * 100 : 50;

  // Fixed vs Variable comparison calculations
  const totalExp = data.totalExpensePaise || 0;
  const fixedRatio = totalExp > 0 ? (data.fixedExpensesPaise / totalExp) * 100 : 0;
  const variableRatio = totalExp > 0 ? (data.variableExpensesPaise / totalExp) * 100 : 0;

  // Monthly trend max
  const maxTrend =
    data.monthlyTrend.reduce(
      (m, item) => Math.max(m, item.incomePaise, item.expensePaise),
      0
    ) || 1000000;

  return (
    <div className="space-y-6">
      {/* 2-column comparison grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income vs Expenses Bar Visualizer */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Income vs. Expenses Flow
              </h4>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Net: {formatCurrency(data.remainingBalancePaise, currency)}
            </span>
          </div>

          {/* Dual progress comparison bar */}
          <div className="space-y-3 pt-2">
            <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              <div
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${incomeRatio}%` }}
                title={`Income: ${incomeRatio.toFixed(1)}%`}
              />
              <div
                className="bg-rose-500 transition-all duration-500"
                style={{ width: `${expenseRatio}%` }}
                title={`Expenses: ${expenseRatio.toFixed(1)}%`}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Total Inflow</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(data.totalIncomePaise, currency)}
                </span>
                <span className="text-[11px] text-slate-400">({incomeRatio.toFixed(0)}%)</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Total Outflow</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(data.totalExpensePaise, currency)}
                </span>
                <span className="text-[11px] text-slate-400">({expenseRatio.toFixed(0)}%)</span>
              </div>
            </div>
          </div>

          {/* Quick savings rate badge */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Current Savings Rate</span>
            <span
              className={`font-mono font-bold text-sm ${
                data.remainingBalancePaise >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {data.totalIncomePaise > 0
                ? `${Math.max(0, (data.remainingBalancePaise / data.totalIncomePaise) * 100).toFixed(1)}%`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Fixed vs Variable Expenses Split */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Fixed vs. Variable Split
              </h4>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Total: {formatCurrency(data.totalExpensePaise, currency)}
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              <div
                className="bg-indigo-600 transition-all duration-500"
                style={{ width: `${fixedRatio}%` }}
                title={`Fixed: ${fixedRatio.toFixed(1)}%`}
              />
              <div
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${variableRatio}%` }}
                title={`Variable: ${variableRatio.toFixed(1)}%`}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Fixed (Recurring)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(data.fixedExpensesPaise, currency)}
                </span>
                <span className="text-[11px] text-slate-400">({fixedRatio.toFixed(0)}%)</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Variable (Daily)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(data.variableExpensesPaise, currency)}
                </span>
                <span className="text-[11px] text-slate-400">({variableRatio.toFixed(0)}%)</span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Monthly Commitment Ratio</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              {fixedRatio.toFixed(1)}% of expenses are recurring obligations
            </span>
          </div>
        </div>
      </div>

      {/* Category Spending Breakdown */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-500" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Category Spending Breakdown
            </h4>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {data.categoryBreakdown.length} active spending channels
          </span>
        </div>

        {data.categoryBreakdown.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No expense transactions found for the selected period.
          </div>
        ) : (
          <div className="space-y-3.5">
            {data.categoryBreakdown.map((cat) => {
              const share = totalExp > 0 ? (cat.amountPaise / totalExp) * 100 : 0;

              return (
                <div key={cat.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {cat.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formatCurrency(cat.amountPaise, currency)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 w-12 text-right">
                        {share.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Visual percentage track */}
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, share)}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6-Month Income vs Expense Trend Chart */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              6-Month Financial Trajectory
            </h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Comparative income vs expense history
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-400">Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-600 dark:text-slate-400">Expense</span>
            </div>
          </div>
        </div>

        {/* Dual bar chart */}
        <div className="flex items-end justify-between gap-3 sm:gap-6 h-48 pt-6 px-2 border-b border-slate-100 dark:border-slate-800">
          {data.monthlyTrend.map((m) => {
            const incHeight = maxTrend > 0 ? (m.incomePaise / maxTrend) * 140 : 4;
            const expHeight = maxTrend > 0 ? (m.expensePaise / maxTrend) * 140 : 4;

            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="flex items-end gap-1.5 h-[140px]">
                  {/* Income bar */}
                  <div
                    className="w-3.5 sm:w-5 bg-emerald-500 hover:bg-emerald-600 rounded-t-md transition-all duration-300 relative"
                    style={{ height: `${Math.max(4, incHeight)}px` }}
                    title={`Income: ${formatCurrency(m.incomePaise, currency)}`}
                  />
                  {/* Expense bar */}
                  <div
                    className="w-3.5 sm:w-5 bg-rose-500 hover:bg-rose-600 rounded-t-md transition-all duration-300 relative"
                    style={{ height: `${Math.max(4, expHeight)}px` }}
                    title={`Expense: ${formatCurrency(m.expensePaise, currency)}`}
                  />
                </div>

                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 text-center whitespace-nowrap">
                  {m.month}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
