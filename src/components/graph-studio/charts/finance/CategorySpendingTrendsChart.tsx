import React, { useMemo } from 'react';
import { ExpenseTransaction, CurrencyCode } from '../../../../types/index.ts';
import { formatCurrency } from '../../../../lib/currency.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { AnimatedProgressBar } from '../../../ui/MotionPrimitives.tsx';
import { PieChart } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface CategorySpendingTrendsChartProps {
  expenses: ExpenseTransaction[];
  currency?: CurrencyCode;
  onSelectCategory?: (categoryName: string) => void;
  onExpand?: () => void;
}

export const CategorySpendingTrendsChart: React.FC<CategorySpendingTrendsChartProps> = ({
  expenses,
  currency = 'INR',
  onSelectCategory,
  onExpand,
}) => {
  const categoryData = useMemo(() => {
    const map = new Map<string, { name: string; amountPaise: number; count: number; color?: string }>();

    expenses.forEach((e) => {
      if (e.deletedAt) return;
      const name = e.categoryName || e.categoryId || 'General';
      const curr = map.get(name) || { name, amountPaise: 0, count: 0, color: e.categoryColor };
      curr.amountPaise += e.amountPaise;
      curr.count += 1;
      map.set(name, curr);
    });

    const list = Array.from(map.values()).sort((a, b) => b.amountPaise - a.amountPaise);
    const totalSpent = list.reduce((sum, item) => sum + item.amountPaise, 0);

    return {
      list: list.map((item) => ({
        ...item,
        percentage: totalSpent > 0 ? Math.round((item.amountPaise / totalSpent) * 100) : 0,
      })),
      totalSpent,
    };
  }, [expenses]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'category_spending_trends',
      ['CategoryName', 'TotalAmountPaise', 'Percentage', 'TransactionCount'],
      categoryData.list.map((c) => [c.name, c.amountPaise, c.percentage, c.count])
    );
  };

  return (
    <GraphCard
      id="category-spending-trends"
      title="Category Spending Breakdown"
      subtitle={`${categoryData.list.length} active spending channels (${formatCurrency(categoryData.totalSpent, currency as CurrencyCode)} total)`}
      domain="finance"
      icon={<PieChart className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={categoryData.list.length === 0}
      emptyTitle="No expenses recorded"
      emptyDescription="Log expense transactions to generate category spending distributions."
    >
      <div className="space-y-3.5 pt-1">
        {categoryData.list.slice(0, 6).map((item) => (
          <div
            key={item.name}
            onClick={() => onSelectCategory?.(item.name)}
            className="space-y-1.5 p-2 rounded-xl hover:bg-[var(--ff-surface-subtle)] transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color || 'var(--ff-warning)' }}
                />
                <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                  {item.name}
                </span>
                <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                  ({item.count} tx)
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                  {formatCurrency(item.amountPaise, currency as CurrencyCode)}
                </span>
                <span className="text-[11px] font-mono text-[var(--ff-text-muted)] w-10 text-right">
                  {item.percentage}%
                </span>
              </div>
            </div>

            <AnimatedProgressBar
              value={Math.max(2, item.percentage)}
              customColor={item.color || 'var(--ff-warning)'}
              heightClass="h-2"
              ariaLabel={`${item.name} spending share`}
            />
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
