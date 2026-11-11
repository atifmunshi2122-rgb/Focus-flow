import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { FinanceSummaryData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { ThemeCard, ThemeProgressBar } from '../ui/ThemePrimitives.tsx';
import { BarChart2, PieChart, Layers } from 'lucide-react';

interface AnalyticsChartsProps {
  data: FinanceSummaryData;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ data }) => {
  const { currency } = useApp();

  const totalFlow = (data.totalIncomePaise || 0) + (data.totalExpensePaise || 0);
  const incomeRatio = totalFlow > 0 ? (data.totalIncomePaise / totalFlow) * 100 : 50;
  const expenseRatio = totalFlow > 0 ? (data.totalExpensePaise / totalFlow) * 100 : 50;

  const totalExp = data.totalExpensePaise || 0;
  const fixedRatio = totalExp > 0 ? (data.fixedExpensesPaise / totalExp) * 100 : 0;
  const variableRatio = totalExp > 0 ? (data.variableExpensesPaise / totalExp) * 100 : 0;

  const maxTrend =
    data.monthlyTrend.reduce(
      (m, item) => Math.max(m, item.incomePaise, item.expensePaise),
      0
    ) || 1000000;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* 2-column comparison grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 'var(--ff-grid-gap)' }}>
        {/* Income vs Expenses Bar Visualizer */}
        <ThemeCard>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Income vs. Expenses Flow
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-[var(--ff-text-muted)]">
              Net: {formatCurrency(data.remainingBalancePaise, currency)}
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <div className="ff-progress-track h-4 w-full flex">
              <div
                className="transition-all duration-500 h-full"
                style={{ width: `${incomeRatio}%`, backgroundColor: 'var(--ff-success)' }}
                title={`Income: ${incomeRatio.toFixed(1)}%`}
              />
              <div
                className="transition-all duration-500 h-full"
                style={{ width: `${expenseRatio}%`, backgroundColor: 'var(--ff-danger)' }}
                title={`Expenses: ${expenseRatio.toFixed(1)}%`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--ff-success)' }}
                />
                <span className="text-[var(--ff-text-secondary)]">Total Inflow</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ff-text-primary)]">
                  {formatCurrency(data.totalIncomePaise, currency)}
                </span>
                <span className="text-[11px] text-[var(--ff-text-muted)]">
                  ({incomeRatio.toFixed(0)}%)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--ff-danger)' }}
                />
                <span className="text-[var(--ff-text-secondary)]">Total Outflow</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ff-text-primary)]">
                  {formatCurrency(data.totalExpensePaise, currency)}
                </span>
                <span className="text-[11px] text-[var(--ff-text-muted)]">
                  ({expenseRatio.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--ff-border-color)] flex items-center justify-between text-xs">
            <span className="text-[var(--ff-text-muted)]">Current Savings Rate</span>
            <span
              className="font-mono font-bold text-sm"
              style={{
                color:
                  data.remainingBalancePaise >= 0 ? 'var(--ff-success)' : 'var(--ff-danger)',
              }}
            >
              {data.totalIncomePaise > 0
                ? `${Math.max(0, (data.remainingBalancePaise / data.totalIncomePaise) * 100).toFixed(1)}%`
                : '0%'}
            </span>
          </div>
        </ThemeCard>

        {/* Fixed vs Variable Expenses Split */}
        <ThemeCard>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" style={{ color: 'var(--ff-accent-secondary)' }} />
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Fixed vs. Variable Split
              </h2>
            </div>
            <span className="text-xs font-mono tabular-nums text-[var(--ff-text-muted)]">
              Total: {formatCurrency(data.totalExpensePaise, currency)}
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <div className="ff-progress-track h-4 w-full flex">
              <div
                className="transition-all duration-500 h-full"
                style={{ width: `${fixedRatio}%`, backgroundColor: 'var(--ff-accent)' }}
                title={`Fixed: ${fixedRatio.toFixed(1)}%`}
              />
              <div
                className="transition-all duration-500 h-full"
                style={{ width: `${variableRatio}%`, backgroundColor: 'var(--ff-warning)' }}
                title={`Variable: ${variableRatio.toFixed(1)}%`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--ff-accent)' }}
                />
                <span className="text-[var(--ff-text-secondary)]">Fixed (Recurring)</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ff-text-primary)]">
                  {formatCurrency(data.fixedExpensesPaise, currency)}
                </span>
                <span className="text-[11px] text-[var(--ff-text-muted)]">
                  ({fixedRatio.toFixed(0)}%)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: 'var(--ff-warning)' }}
                />
                <span className="text-[var(--ff-text-secondary)]">Variable (Daily)</span>
                <span className="font-mono tabular-nums font-semibold text-[var(--ff-text-primary)]">
                  {formatCurrency(data.variableExpensesPaise, currency)}
                </span>
                <span className="text-[11px] text-[var(--ff-text-muted)]">
                  ({variableRatio.toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--ff-border-color)] flex items-center justify-between text-xs">
            <span className="text-[var(--ff-text-muted)]">Monthly Commitment Ratio</span>
            <span className="font-mono font-semibold text-[var(--ff-text-primary)]">
              {fixedRatio.toFixed(1)}% of expenses are recurring obligations
            </span>
          </div>
        </ThemeCard>
      </div>

      {/* Category Spending Breakdown */}
      <ThemeCard>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
            <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Category Spending Breakdown
            </h2>
          </div>
          <span className="text-xs text-[var(--ff-text-muted)]">
            {data.categoryBreakdown.length} active spending channels
          </span>
        </div>

        {data.categoryBreakdown.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
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
                      <span className="font-semibold text-[var(--ff-text-primary)]">
                        {cat.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums font-bold text-[var(--ff-text-primary)]">
                        {formatCurrency(cat.amountPaise, currency)}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--ff-text-muted)] w-12 text-right">
                        {share.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <ThemeProgressBar
                    value={Math.max(2, share)}
                    customColor={cat.color}
                    heightClass="h-2"
                    label={`${cat.name} spending share`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </ThemeCard>

      {/* 6-Month Income vs Expense Trend Chart */}
      <ThemeCard>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
              6-Month Financial Trajectory
            </h2>
            <span className="text-xs text-[var(--ff-text-muted)]">
              Comparative income vs expense history
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: 'var(--ff-success)' }}
              />
              <span className="text-[var(--ff-text-secondary)]">Income</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: 'var(--ff-danger)' }}
              />
              <span className="text-[var(--ff-text-secondary)]">Expense</span>
            </div>
          </div>
        </div>

        {/* Dual bar chart */}
        <div
          className="flex items-end justify-between gap-3 sm:gap-6 h-48 pt-6 px-2 border-b"
          style={{ borderColor: 'var(--ff-border-color)' }}
        >
          {data.monthlyTrend.map((m) => {
            const incHeight = maxTrend > 0 ? (m.incomePaise / maxTrend) * 140 : 4;
            const expHeight = maxTrend > 0 ? (m.expensePaise / maxTrend) * 140 : 4;

            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="flex items-end gap-1.5 h-[140px]">
                  <div
                    className="w-3.5 sm:w-5 transition-all duration-300 relative"
                    style={{
                      height: `${Math.max(4, incHeight)}px`,
                      backgroundColor: 'var(--ff-success)',
                      borderTopLeftRadius: 'var(--ff-radius-badge)',
                      borderTopRightRadius: 'var(--ff-radius-badge)',
                    }}
                    title={`Income: ${formatCurrency(m.incomePaise, currency)}`}
                  />
                  <div
                    className="w-3.5 sm:w-5 transition-all duration-300 relative"
                    style={{
                      height: `${Math.max(4, expHeight)}px`,
                      backgroundColor: 'var(--ff-danger)',
                      borderTopLeftRadius: 'var(--ff-radius-badge)',
                      borderTopRightRadius: 'var(--ff-radius-badge)',
                    }}
                    title={`Expense: ${formatCurrency(m.expensePaise, currency)}`}
                  />
                </div>

                <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] text-center whitespace-nowrap">
                  {m.month}
                </span>
              </div>
            );
          })}
        </div>
      </ThemeCard>
    </div>
  );
};
