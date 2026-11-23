import React, { useMemo } from 'react';
import { FocusSession, ExpenseTransaction, CurrencyCode } from '../../../../types/index.ts';
import { getSessionFocusSeconds } from '../../../../lib/pomodoroAnalytics.ts';
import { formatCurrency } from '../../../../lib/currency.ts';
import { formatDateInTimezone } from '../../../../lib/dateTime.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GitCompare } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface FocusVsSpendCorrelationChartProps {
  sessions: FocusSession[];
  expenses: ExpenseTransaction[];
  startDateStr: string;
  endDateStr: string;
  currency?: CurrencyCode;
  onExpand?: () => void;
}

export const FocusVsSpendCorrelationChart: React.FC<FocusVsSpendCorrelationChartProps> = ({
  sessions,
  expenses,
  startDateStr,
  endDateStr,
  currency = 'INR',
  onExpand,
}) => {
  const correlationData = useMemo(() => {
    // Map by date YYYY-MM-DD
    const focusMap = new Map<string, number>();
    const spendMap = new Map<string, number>();

    sessions.forEach((s) => {
      if ((!s.completed && s.status !== 'completed') || s.mode !== 'work' || !s.startedAt) return;
      const d = s.startedAt.slice(0, 10);
      focusMap.set(d, (focusMap.get(d) || 0) + Math.round(getSessionFocusSeconds(s) / 60));
    });

    expenses.forEach((e) => {
      if (e.deletedAt || e.type !== 'variable' || !e.date) return;
      spendMap.set(e.date, (spendMap.get(e.date) || 0) + e.amountPaise);
    });

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const pairs: Array<{ date: string; focusMinutes: number; spendPaise: number }> = [];

    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const cur = new Date(start);
      while (cur <= end) {
        const dateStr = formatDateInTimezone(cur);
        const focusMinutes = focusMap.get(dateStr) || 0;
        const spendPaise = spendMap.get(dateStr) || 0;

        pairs.push({ date: dateStr, focusMinutes, spendPaise });
        cur.setDate(cur.getDate() + 1);
      }
    }

    // Keep last 14 days for readable dual column pairs
    const activePairs = pairs.slice(-14);

    const maxFocus = Math.max(60, ...activePairs.map((p) => p.focusMinutes));
    const maxSpend = Math.max(100, ...activePairs.map((p) => p.spendPaise));

    // Calculate Pearson correlation coefficient r
    const n = activePairs.length;
    let r = 0;
    if (n > 2) {
      const meanX = activePairs.reduce((s, p) => s + p.focusMinutes, 0) / n;
      const meanY = activePairs.reduce((s, p) => s + p.spendPaise, 0) / n;

      let num = 0;
      let denX = 0;
      let denY = 0;

      activePairs.forEach((p) => {
        const dx = p.focusMinutes - meanX;
        const dy = p.spendPaise - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      });

      const denom = Math.sqrt(denX * denY);
      r = denom > 0 ? Math.round((num / denom) * 100) / 100 : 0;
    }

    let correlationExplanation = 'Insufficient variance to determine correlation.';
    if (r < -0.2) {
      correlationExplanation = `Moderate inverse correlation (r = ${r}) — lower focus days show higher discretionary expenditure.`;
    } else if (r > 0.2) {
      correlationExplanation = `Positive correlation (r = ${r}) — higher focus days show higher discretionary spend.`;
    } else {
      correlationExplanation = `Neutral correlation (r = ${r}) — discretionary spending shows no direct dependence on focus duration.`;
    }

    return { activePairs, maxFocus, maxSpend, r, correlationExplanation };
  }, [sessions, expenses, startDateStr, endDateStr]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'focus_vs_discretionary_spend',
      ['Date', 'FocusMinutes', 'DiscretionarySpendPaise'],
      correlationData.activePairs.map((p) => [p.date, p.focusMinutes, p.spendPaise])
    );
  };

  return (
    <GraphCard
      id="focus-vs-spend-correlation"
      title="Focus Hours vs Discretionary Expense Correlation"
      subtitle={correlationData.correlationExplanation}
      domain="custom"
      icon={<GitCompare className="w-4 h-4 text-[var(--ff-accent-text)]" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={correlationData.activePairs.length === 0}
      legend={[
        { label: 'Focus Minutes', color: 'var(--ff-accent)' },
        { label: 'Discretionary Spend', color: 'var(--ff-warning)' },
      ]}
    >
      <div className="space-y-3 pt-3">
        <div className="flex items-end justify-between gap-1.5 sm:gap-3 h-48 px-1 border-b border-[var(--ff-border-color)]">
          {correlationData.activePairs.map((p) => {
            const focusHeight = Math.max(4, Math.round((p.focusMinutes / correlationData.maxFocus) * 100));
            const spendHeight = Math.max(4, Math.round((p.spendPaise / correlationData.maxSpend) * 100));

            return (
              <div
                key={p.date}
                className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer"
                title={`${p.date}: ${p.focusMinutes}m focus · ${formatCurrency(p.spendPaise, currency as CurrencyCode)} spend`}
              >
                <div className="flex items-end gap-1 h-32">
                  <div
                    className="w-2.5 sm:w-4 rounded-t-xs transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                    style={{
                      height: `${focusHeight}%`,
                      backgroundColor: 'var(--ff-accent)',
                    }}
                  />
                  <div
                    className="w-2.5 sm:w-4 rounded-t-xs transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                    style={{
                      height: `${spendHeight}%`,
                      backgroundColor: 'var(--ff-warning)',
                    }}
                  />
                </div>

                <span className="text-[9px] font-mono text-[var(--ff-text-muted)] group-hover:text-[var(--ff-text-primary)]">
                  {p.date.slice(8)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs font-mono text-[var(--ff-text-muted)] pt-1">
          <span>Dual-Axis Pearson Correlation: r = {correlationData.r}</span>
          <span className="text-[11px] font-bold text-[var(--ff-accent-text)]">Cross-Domain Insight</span>
        </div>
      </div>
    </GraphCard>
  );
};
