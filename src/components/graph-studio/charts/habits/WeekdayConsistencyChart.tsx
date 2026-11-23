import React, { useMemo } from 'react';
import { Habit } from '../../../../types/index.ts';
import { isHabitScheduledOnDate } from '../../../../lib/productivityIntelligence.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { Calendar } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface WeekdayConsistencyChartProps {
  habits: Habit[];
  onExpand?: () => void;
}

export const WeekdayConsistencyChart: React.FC<WeekdayConsistencyChartProps> = ({
  habits,
  onExpand,
}) => {
  const weekdayStats = useMemo(() => {
    const days = [
      { name: 'Mon', dayIndex: 1, scheduled: 0, completed: 0 },
      { name: 'Tue', dayIndex: 2, scheduled: 0, completed: 0 },
      { name: 'Wed', dayIndex: 3, scheduled: 0, completed: 0 },
      { name: 'Thu', dayIndex: 4, scheduled: 0, completed: 0 },
      { name: 'Fri', dayIndex: 5, scheduled: 0, completed: 0 },
      { name: 'Sat', dayIndex: 6, scheduled: 0, completed: 0 },
      { name: 'Sun', dayIndex: 0, scheduled: 0, completed: 0 },
    ];

    const activeHabits = habits.filter((h) => !h.archived && !h.deletedAt);

    activeHabits.forEach((h) => {
      h.completedDates.forEach((dateStr) => {
        try {
          const d = new Date(dateStr + 'T00:00:00');
          const day = d.getDay();
          const target = days.find((item) => item.dayIndex === day);
          if (target) {
            target.completed += 1;
          }
        } catch {
          // ignore
        }
      });
    });

    const maxCount = Math.max(1, ...days.map((d) => d.completed));

    return {
      days: days.map((d) => ({
        ...d,
        heightPct: Math.max(6, Math.round((d.completed / maxCount) * 100)),
      })),
      totalCompletions: days.reduce((sum, d) => sum + d.completed, 0),
    };
  }, [habits]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'weekday_habit_consistency',
      ['DayName', 'CompletedCount'],
      weekdayStats.days.map((d) => [d.name, d.completed])
    );
  };

  return (
    <GraphCard
      id="weekday-consistency"
      title="Weekday Consistency Breakdown"
      subtitle={`${weekdayStats.totalCompletions} habit executions across all days of the week`}
      domain="habits"
      icon={<Calendar className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={weekdayStats.totalCompletions === 0}
      legend={[{ label: 'Execution Volume', color: 'var(--ff-accent)' }]}
    >
      <div className="relative pt-4">
        <div className="flex items-end justify-between gap-2 sm:gap-4 h-44 px-2 border-b border-[var(--ff-border-color)]">
          {weekdayStats.days.map((d) => (
            <div key={d.name} className="flex-1 flex flex-col items-center gap-1.5 group">
              <span className="text-[10px] font-mono font-bold text-[var(--ff-text-muted)] group-hover:text-[var(--ff-text-primary)]">
                {d.completed}
              </span>

              <div className="w-full flex items-end justify-center h-28">
                <div
                  className="w-full max-w-[28px] rounded-t-sm transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                  style={{
                    height: `${d.heightPct}%`,
                    backgroundColor: 'var(--ff-accent)',
                  }}
                />
              </div>

              <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] group-hover:text-[var(--ff-text-primary)]">
                {d.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </GraphCard>
  );
};
