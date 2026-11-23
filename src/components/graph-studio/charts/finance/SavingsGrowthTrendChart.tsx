import React, { useMemo } from 'react';
import { SavingsGoal, CurrencyCode } from '../../../../types/index.ts';
import { formatCurrency } from '../../../../lib/currency.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { PiggyBank } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface SavingsGrowthTrendChartProps {
  goals: SavingsGoal[];
  currency?: CurrencyCode;
  onExpand?: () => void;
}

export const SavingsGrowthTrendChart: React.FC<SavingsGrowthTrendChartProps> = ({
  goals,
  currency = 'INR',
  onExpand,
}) => {
  const savingsData = useMemo(() => {
    const list = goals.map((g) => {
      const savedPct = g.targetPaise > 0 ? Math.round((g.savedPaise / g.targetPaise) * 100) : 100;
      return {
        id: g.id,
        title: g.title,
        savedPaise: g.savedPaise,
        targetPaise: g.targetPaise,
        savedPct,
        targetDate: g.targetDate || 'Unspecified',
        color: g.color || 'var(--ff-success)',
      };
    }).sort((a, b) => b.savedPct - a.savedPct);

    const totalSaved = list.reduce((sum, g) => sum + g.savedPaise, 0);
    const totalTarget = list.reduce((sum, g) => sum + g.targetPaise, 0);
    const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

    return { list, totalSaved, totalTarget, overallPct };
  }, [goals]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'savings_growth_goals',
      ['GoalTitle', 'SavedPaise', 'TargetPaise', 'CompletionPct', 'TargetDate'],
      savingsData.list.map((g) => [g.title, g.savedPaise, g.targetPaise, g.savedPct, g.targetDate])
    );
  };

  return (
    <GraphCard
      id="savings-growth-trend"
      title="Savings Growth & Milestone Velocity"
      subtitle={`${formatCurrency(savingsData.totalSaved, currency as CurrencyCode)} saved across ${savingsData.list.length} goals (${savingsData.overallPct}% of target)`}
      domain="finance"
      icon={<PiggyBank className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={savingsData.list.length === 0}
      emptyTitle="No savings goals created"
      emptyDescription="Create savings targets in Finance to track your wealth trajectory."
      legend={[
        { label: 'Saved (Actual)', color: 'var(--ff-success)' },
        { label: 'Remaining to Target', color: 'var(--ff-border-color)', isDashed: true },
      ]}
    >
      <div className="space-y-4 pt-1">
        {savingsData.list.map((goal) => (
          <div
            key={goal.id}
            className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: goal.color }} />
                <span className="font-bold text-[var(--ff-text-primary)]">{goal.title}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold text-[var(--ff-success)]">
                  {formatCurrency(goal.savedPaise, currency as CurrencyCode)}
                </span>
                <span className="text-[var(--ff-text-muted)]">
                  / {formatCurrency(goal.targetPaise, currency as CurrencyCode)}
                </span>
                <span className="font-semibold text-xs text-[var(--ff-accent-text)]">
                  ({goal.savedPct}%)
                </span>
              </div>
            </div>

            {/* Stepped Progress Track */}
            <div className="w-full bg-[var(--ff-border-color)]/40 h-2.5 rounded-full overflow-hidden flex">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, goal.savedPct)}%`,
                  backgroundColor: goal.color,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-[var(--ff-text-muted)] font-mono">
              <span>Target Deadline: {goal.targetDate}</span>
              <span>
                Remaining: {formatCurrency(Math.max(0, goal.targetPaise - goal.savedPaise), currency)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
