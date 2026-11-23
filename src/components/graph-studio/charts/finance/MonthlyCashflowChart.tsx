import React, { useMemo, useState } from 'react';
import { IncomeTransaction, ExpenseTransaction, CurrencyCode } from '../../../../types/index.ts';
import { formatCurrency } from '../../../../lib/currency.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphTooltip } from '../../core/GraphTooltip.tsx';
import { ArrowLeftRight } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface MonthlyCashflowChartProps {
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  currency?: CurrencyCode;
  onSelectMonth?: (monthStr: string) => void;
  onExpand?: () => void;
}

export const MonthlyCashflowChart: React.FC<MonthlyCashflowChartProps> = ({
  incomes,
  expenses,
  currency = 'INR',
  onSelectMonth,
  onExpand,
}) => {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    title: string;
    subtitle: string;
    items: Array<{ label: string; value: string | number; color?: string }>;
  }>({ visible: false, x: 0, y: 0, title: '', subtitle: '', items: [] });

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; incomePaise: number; expensePaise: number }>();

    incomes.forEach((i) => {
      if (i.deletedAt) return;
      const m = i.date ? i.date.slice(0, 7) : '';
      if (!m) return;
      const curr = map.get(m) || { month: m, incomePaise: 0, expensePaise: 0 };
      curr.incomePaise += i.amountPaise;
      map.set(m, curr);
    });

    expenses.forEach((e) => {
      if (e.deletedAt) return;
      const m = e.date ? e.date.slice(0, 7) : '';
      if (!m) return;
      const curr = map.get(m) || { month: m, incomePaise: 0, expensePaise: 0 };
      curr.expensePaise += e.amountPaise;
      map.set(m, curr);
    });

    // Sort ascending by month YYYY-MM
    const sorted = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    // Keep last 6 to 12 months
    const trimmed = sorted.slice(-6);

    const maxVal = trimmed.reduce((max, d) => Math.max(max, d.incomePaise, d.expensePaise), 0) || 1;

    return {
      months: trimmed.map((d) => {
        const netPaise = d.incomePaise - d.expensePaise;
        const savingsRate = d.incomePaise > 0 ? Math.round((netPaise / d.incomePaise) * 100) : 0;
        return {
          ...d,
          netPaise,
          savingsRate,
          incHeightPct: Math.max(6, Math.round((d.incomePaise / maxVal) * 100)),
          expHeightPct: Math.max(6, Math.round((d.expensePaise / maxVal) * 100)),
        };
      }),
      maxVal,
    };
  }, [incomes, expenses]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'monthly_cashflow',
      ['Month', 'IncomePaise', 'ExpensePaise', 'NetSurplusPaise', 'SavingsRatePct'],
      monthlyData.months.map((m) => [m.month, m.incomePaise, m.expensePaise, m.netPaise, m.savingsRate])
    );
  };

  return (
    <GraphCard
      id="monthly-cashflow"
      title="Monthly Cashflow Inflow vs Outflow"
      subtitle="Income vs Expense trajectory with net operating surplus"
      domain="finance"
      icon={<ArrowLeftRight className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={monthlyData.months.length === 0}
      legend={[
        { label: 'Inflow', color: 'var(--ff-success)' },
        { label: 'Outflow', color: 'var(--ff-danger)' },
      ]}
    >
      <div className="relative pt-4">
        <div className="flex items-end justify-between gap-3 sm:gap-6 h-52 px-2 border-b border-[var(--ff-border-color)]">
          {monthlyData.months.map((m) => (
            <div
              key={m.month}
              onClick={() => onSelectMonth?.(m.month)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  visible: true,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  title: `Month: ${m.month}`,
                  subtitle: `Net: ${formatCurrency(m.netPaise, currency as CurrencyCode)} (${m.savingsRate}% saved)`,
                  items: [
                    { label: 'Inflow', value: formatCurrency(m.incomePaise, currency as CurrencyCode), color: 'var(--ff-success)' },
                    { label: 'Outflow', value: formatCurrency(m.expensePaise, currency as CurrencyCode), color: 'var(--ff-danger)' },
                  ],
                });
              }}
              onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
              className="flex-1 flex flex-col items-center gap-2 group cursor-pointer"
            >
              <div className="flex items-end gap-1.5 h-36">
                <div
                  className="w-4 sm:w-6 rounded-t-sm transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                  style={{
                    height: `${m.incHeightPct}%`,
                    backgroundColor: 'var(--ff-success)',
                  }}
                />
                <div
                  className="w-4 sm:w-6 rounded-t-sm transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                  style={{
                    height: `${m.expHeightPct}%`,
                    backgroundColor: 'var(--ff-danger)',
                  }}
                />
              </div>

              <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] group-hover:text-[var(--ff-text-primary)]">
                {m.month.slice(5)}
              </span>
            </div>
          ))}
        </div>

        <GraphTooltip
          visible={tooltip.visible}
          x={tooltip.x}
          y={tooltip.y}
          title={tooltip.title}
          subtitle={tooltip.subtitle}
          items={tooltip.items}
        />
      </div>
    </GraphCard>
  );
};
