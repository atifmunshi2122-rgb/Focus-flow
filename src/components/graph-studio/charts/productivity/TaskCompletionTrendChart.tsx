import React, { useMemo } from 'react';
import { Task } from '../../../../types/index.ts';
import { formatDateInTimezone } from '../../../../lib/dateTime.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { CheckSquare } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface TaskCompletionTrendChartProps {
  tasks: Task[];
  startDateStr: string;
  endDateStr: string;
  onExpand?: () => void;
}

export const TaskCompletionTrendChart: React.FC<TaskCompletionTrendChartProps> = ({
  tasks,
  startDateStr,
  endDateStr,
  onExpand,
}) => {
  const taskStats = useMemo(() => {
    // Map completed tasks by date
    const dayMap = new Map<string, { high: number; medium: number; low: number; total: number }>();

    tasks.forEach((t) => {
      if (t.status !== 'completed' || !t.completedAt) return;
      const d = t.completedAt.slice(0, 10);
      if (!d) return;

      const curr = dayMap.get(d) || { high: 0, medium: 0, low: 0, total: 0 };
      if (t.priority === 'high') curr.high += 1;
      else if (t.priority === 'medium') curr.medium += 1;
      else curr.low += 1;
      curr.total += 1;
      dayMap.set(d, curr);
    });

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const days: Array<{
      date: string;
      high: number;
      medium: number;
      low: number;
      total: number;
      cumulative: number;
    }> = [];

    let cum = 0;
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const cur = new Date(start);
      while (cur <= end) {
        const dateStr = formatDateInTimezone(cur);
        const data = dayMap.get(dateStr) || { high: 0, medium: 0, low: 0, total: 0 };
        cum += data.total;

        days.push({
          date: dateStr,
          high: data.high,
          medium: data.medium,
          low: data.low,
          total: data.total,
          cumulative: cum,
        });

        cur.setDate(cur.getDate() + 1);
      }
    }

    const totalCompleted = tasks.filter((t) => t.status === 'completed').length;
    const pendingCount = tasks.filter((t) => t.status !== 'completed').length;
    const maxDayTotal = Math.max(1, ...days.map((d) => d.total));

    return { days, totalCompleted, pendingCount, maxDayTotal };
  }, [tasks, startDateStr, endDateStr]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'task_completion_trend',
      ['Date', 'HighPriority', 'MediumPriority', 'LowPriority', 'DailyTotal', 'CumulativeCompleted'],
      taskStats.days.map((d) => [d.date, d.high, d.medium, d.low, d.total, d.cumulative])
    );
  };

  return (
    <GraphCard
      id="task-completion-trend"
      title="Task Completion & Velocity Trend"
      subtitle={`${taskStats.totalCompleted} tasks completed · ${taskStats.pendingCount} backlog pending`}
      domain="productivity"
      icon={<CheckSquare className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={taskStats.days.length === 0 || taskStats.totalCompleted === 0}
      emptyTitle="No tasks completed in timeframe"
      emptyDescription="Mark tasks as finished to generate task completion velocity trends."
      legend={[
        { label: 'High Priority', color: 'var(--ff-danger)' },
        { label: 'Medium Priority', color: 'var(--ff-warning)' },
        { label: 'Low Priority', color: 'var(--ff-accent)' },
      ]}
    >
      <div className="space-y-4 pt-2">
        <div className="flex items-end justify-between gap-1.5 sm:gap-2.5 h-44 px-1 border-b border-[var(--ff-border-color)]">
          {taskStats.days.map((d) => {
            const heightPct = Math.max(4, Math.round((d.total / taskStats.maxDayTotal) * 100));
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="w-full flex items-end justify-center h-32">
                  <div
                    className="w-full max-w-[20px] rounded-t-xs transition-all duration-300 group-hover:scale-y-105 origin-bottom flex flex-col justify-end overflow-hidden"
                    style={{ height: `${heightPct}%` }}
                    title={`${d.date}: ${d.total} tasks (${d.high} high, ${d.medium} med, ${d.low} low)`}
                  >
                    {d.high > 0 && (
                      <div
                        style={{
                          height: `${(d.high / d.total) * 100}%`,
                          backgroundColor: 'var(--ff-danger)',
                        }}
                      />
                    )}
                    {d.medium > 0 && (
                      <div
                        style={{
                          height: `${(d.medium / d.total) * 100}%`,
                          backgroundColor: 'var(--ff-warning)',
                        }}
                      />
                    )}
                    {d.low > 0 && (
                      <div
                        style={{
                          height: `${(d.low / d.total) * 100}%`,
                          backgroundColor: 'var(--ff-accent)',
                        }}
                      />
                    )}
                  </div>
                </div>

                <span className="text-[9px] font-mono text-[var(--ff-text-muted)] group-hover:text-[var(--ff-text-primary)]">
                  {d.date.slice(8)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs font-mono text-[var(--ff-text-muted)] pt-1">
          <span>Daily Finishing Velocity</span>
          <span className="font-bold text-[var(--ff-text-primary)]">
            Cumulative: {taskStats.days[taskStats.days.length - 1]?.cumulative || 0} tasks
          </span>
        </div>
      </div>
    </GraphCard>
  );
};
