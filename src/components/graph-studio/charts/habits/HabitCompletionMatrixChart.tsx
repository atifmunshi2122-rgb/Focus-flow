import React, { useMemo } from 'react';
import { Habit } from '../../../../types/index.ts';
import { isHabitScheduledOnDate } from '../../../../lib/productivityIntelligence.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { Sparkles, Check, X } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface HabitCompletionMatrixChartProps {
  habits: Habit[];
  startDateStr: string;
  endDateStr: string;
  onExpand?: () => void;
}

export const HabitCompletionMatrixChart: React.FC<HabitCompletionMatrixChartProps> = ({
  habits,
  startDateStr,
  endDateStr,
  onExpand,
}) => {
  const activeHabits = useMemo(() => {
    return habits.filter((h) => !h.archived && !h.deletedAt);
  }, [habits]);

  const datesList = useMemo(() => {
    const dates: string[] = [];
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const cur = new Date(start);
      while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    }
    // Limit to last 28 days for dense matrix readability
    return dates.slice(-28);
  }, [startDateStr, endDateStr]);

  const matrixStats = useMemo(() => {
    let totalScheduled = 0;
    let totalCompleted = 0;

    activeHabits.forEach((h) => {
      datesList.forEach((d) => {
        if (isHabitScheduledOnDate(h, d)) {
          totalScheduled += 1;
          if (h.completedDates.includes(d)) {
            totalCompleted += 1;
          }
        }
      });
    });

    const overallRate = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
    return { totalScheduled, totalCompleted, overallRate };
  }, [activeHabits, datesList]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'habit_completion_matrix',
      ['HabitTitle', ...datesList],
      activeHabits.map((h) => [
        h.title,
        ...datesList.map((d) => (h.completedDates.includes(d) ? 'COMPLETED' : isHabitScheduledOnDate(h, d) ? 'MISSED' : 'REST')),
      ])
    );
  };

  return (
    <GraphCard
      id="habit-completion-matrix"
      title="Habit Completion Matrix"
      subtitle={`${matrixStats.overallRate}% overall adherence (${matrixStats.totalCompleted} / ${matrixStats.totalScheduled} scheduled executions)`}
      domain="habits"
      icon={<Sparkles className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={activeHabits.length === 0}
      emptyTitle="No active habits"
      emptyDescription="Create recurring habits to unlock consistency matrix tracking."
      legend={[
        { label: 'Completed', color: 'var(--ff-success)' },
        { label: 'Missed', color: 'var(--ff-danger)' },
        { label: 'Rest Day', color: 'var(--ff-surface-subtle)' },
      ]}
    >
      <div className="overflow-x-auto pt-2">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-[var(--ff-border-color)]">
              <th className="py-2 px-2 text-[var(--ff-text-muted)] font-semibold w-36">Habit</th>
              {datesList.map((d) => (
                <th key={d} className="py-2 px-1 text-center font-mono text-[9px] text-[var(--ff-text-muted)]">
                  {d.slice(8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ff-border-color)]/40">
            {activeHabits.map((h) => (
              <tr key={h.id} className="hover:bg-[var(--ff-surface-subtle)]">
                <td className="py-2 px-2 font-medium text-[var(--ff-text-primary)] truncate max-w-[140px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: h.color || 'var(--ff-accent)' }} />
                    <span className="truncate">{h.title}</span>
                  </div>
                </td>
                {datesList.map((d) => {
                  const isScheduled = isHabitScheduledOnDate(h, d);
                  const isDone = h.completedDates.includes(d);

                  return (
                    <td key={d} className="py-2 px-1 text-center">
                      <div
                        className="w-4 h-4 rounded-xs mx-auto flex items-center justify-center transition-all"
                        style={{
                          backgroundColor: isDone
                            ? 'var(--ff-success)'
                            : isScheduled
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'var(--ff-surface-subtle)',
                          color: isDone ? '#ffffff' : isScheduled ? 'var(--ff-danger)' : 'transparent',
                        }}
                        title={`${h.title} on ${d}: ${isDone ? 'Completed' : isScheduled ? 'Missed' : 'Rest'}`}
                      >
                        {isDone ? <Check className="w-2.5 h-2.5" /> : isScheduled ? <X className="w-2.5 h-2.5" /> : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GraphCard>
  );
};
