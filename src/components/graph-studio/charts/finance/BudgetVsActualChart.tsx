import React, { useMemo } from 'react';
import { BudgetEnvelope, ExpenseTransaction, CurrencyCode } from '../../../../types/index.ts';
import { formatCurrency } from '../../../../lib/currency.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { Wallet } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface BudgetVsActualChartProps {
  envelopes: BudgetEnvelope[];
  expenses: ExpenseTransaction[];
  monthKey: string; // YYYY-MM
  currency?: CurrencyCode;
  onExpand?: () => void;
}

export const BudgetVsActualChart: React.FC<BudgetVsActualChartProps> = ({
  envelopes,
  expenses,
  monthKey,
  currency = 'INR',
  onExpand,
}) => {
  const envelopeData = useMemo(() => {
    // Filter expenses for monthKey
    const monthExpenses = expenses.filter((e) => !e.deletedAt && e.date.startsWith(monthKey));

    return envelopes
      .filter((env) => !env.deletedAt && (!env.monthKey || env.monthKey === monthKey))
      .map((env) => {
        // Calculate actual spent for this envelope category
        const spentPaise = monthExpenses
          .filter((e) => e.categoryId === env.categoryId || e.categoryName === env.name)
          .reduce((sum, e) => sum + e.amountPaise, 0);

        const burnPct =
          env.allocatedPaise > 0 ? Math.round((spentPaise / env.allocatedPaise) * 100) : 0;

        let tone: 'success' | 'warning' | 'danger' = 'success';
        if (burnPct >= 100) tone = 'danger';
        else if (burnPct >= 80) tone = 'warning';

        return {
          id: env.id,
          name: env.name,
          allocatedPaise: env.allocatedPaise,
          spentPaise,
          burnPct,
          tone,
          color: env.color || 'var(--ff-accent)',
        };
      })
      .sort((a, b) => b.burnPct - a.burnPct);
  }, [envelopes, expenses, monthKey]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      `budget_vs_actual_${monthKey}`,
      ['EnvelopeName', 'AllocatedPaise', 'SpentPaise', 'BurnRatePct', 'Status'],
      envelopeData.map((e) => [
        e.name,
        e.allocatedPaise,
        e.spentPaise,
        e.burnPct,
        e.burnPct >= 100 ? 'OVER_BUDGET' : 'ON_TRACK',
      ])
    );
  };

  return (
    <GraphCard
      id="budget-vs-actual"
      title="Budget Envelopes vs Actual Spending"
      subtitle={`Monthly consumption & burn rate for ${monthKey}`}
      domain="finance"
      icon={<Wallet className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={envelopeData.length === 0}
      emptyTitle="No budget envelopes configured"
      emptyDescription="Create departmental budget envelopes in Finance to track monthly spending caps."
      legend={[
        { label: 'Normal (<80%)', color: 'var(--ff-success)' },
        { label: 'Warning (80-99%)', color: 'var(--ff-warning)' },
        { label: 'Over Budget (100%+)', color: 'var(--ff-danger)' },
      ]}
    >
      <div className="space-y-3.5 pt-1">
        {envelopeData.map((item) => (
          <div
            key={item.id}
            className="p-2.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-semibold text-[var(--ff-text-primary)]">{item.name}</span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="font-bold text-[var(--ff-text-primary)]">
                  {formatCurrency(item.spentPaise, currency as CurrencyCode)}
                </span>
                <span className="text-[var(--ff-text-muted)]">
                  / {formatCurrency(item.allocatedPaise, currency as CurrencyCode)}
                </span>
                <span
                  className="font-bold px-1.5 py-0.2 rounded text-[10px]"
                  style={{
                    backgroundColor:
                      item.tone === 'danger'
                        ? 'var(--ff-danger-soft, rgba(239, 68, 68, 0.15))'
                        : item.tone === 'warning'
                        ? 'var(--ff-warning-soft, rgba(245, 158, 11, 0.15))'
                        : 'var(--ff-success-soft, rgba(16, 185, 129, 0.15))',
                    color:
                      item.tone === 'danger'
                        ? 'var(--ff-danger)'
                        : item.tone === 'warning'
                        ? 'var(--ff-warning)'
                        : 'var(--ff-success)',
                  }}
                >
                  {item.burnPct}%
                </span>
              </div>
            </div>

            {/* Progress track */}
            <div className="w-full bg-[var(--ff-border-color)]/40 h-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, item.burnPct)}%`,
                  backgroundColor:
                    item.tone === 'danger'
                      ? 'var(--ff-danger)'
                      : item.tone === 'warning'
                      ? 'var(--ff-warning)'
                      : 'var(--ff-success)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
