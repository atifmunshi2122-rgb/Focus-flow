import React, { useMemo } from 'react';
import { Task } from '../../../../types/index.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { Compass } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface EstimatedVsActualFocusChartProps {
  tasks: Task[];
  onExpand?: () => void;
}

export const EstimatedVsActualFocusChart: React.FC<EstimatedVsActualFocusChartProps> = ({
  tasks,
  onExpand,
}) => {
  const estimationStats = useMemo(() => {
    const list = tasks
      .filter((t) => t.estimatedPomodoros > 0 || t.completedPomodoros > 0)
      .map((t) => {
        const estimatedMins = t.estimatedPomodoros * 25;
        const actualMins = t.completedPomodoros * 25;
        const delta = actualMins - estimatedMins;

        let bias: 'underestimated' | 'accurate' | 'overestimated' = 'accurate';
        if (delta > 15) bias = 'underestimated';
        else if (delta < -15) bias = 'overestimated';

        return {
          id: t.id,
          title: t.title,
          estimatedMins,
          actualMins,
          delta,
          bias,
        };
      });

    const totalEst = list.reduce((sum, t) => sum + t.estimatedMins, 0);
    const totalAct = list.reduce((sum, t) => sum + t.actualMins, 0);
    const accuracyPct =
      totalEst > 0
        ? Math.max(0, Math.round((1 - Math.abs(totalAct - totalEst) / totalEst) * 100))
        : 100;

    return { list, totalEst, totalAct, accuracyPct };
  }, [tasks]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'estimated_vs_actual_focus',
      ['TaskTitle', 'EstimatedMinutes', 'ActualMinutes', 'VarianceMinutes', 'PlanningBias'],
      estimationStats.list.map((t) => [t.title, t.estimatedMins, t.actualMins, t.delta, t.bias])
    );
  };

  return (
    <GraphCard
      id="estimated-vs-actual-focus"
      title="Estimated vs Actual Focus Time"
      subtitle={`${estimationStats.accuracyPct}% overall planning accuracy across ${estimationStats.list.length} tasks`}
      domain="productivity"
      icon={<Compass className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={estimationStats.list.length === 0}
      emptyTitle="No tasks with estimates"
      emptyDescription="Set estimated Pomodoros on your tasks to analyze planning calibration."
      legend={[
        { label: 'Estimated', color: 'var(--ff-accent)' },
        { label: 'Actual Logged', color: 'var(--ff-warning)' },
      ]}
    >
      <div className="space-y-3.5 pt-1">
        {estimationStats.list.slice(0, 6).map((item) => (
          <div
            key={item.id}
            className="p-2.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--ff-text-primary)] truncate max-w-[240px]">
                {item.title}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                  item.bias === 'accurate'
                    ? 'text-emerald-400 bg-emerald-500/15'
                    : item.bias === 'underestimated'
                    ? 'text-rose-400 bg-rose-500/15'
                    : 'text-amber-400 bg-amber-500/15'
                }`}
              >
                {item.bias === 'accurate'
                  ? 'Accurate'
                  : item.bias === 'underestimated'
                  ? `+${item.delta}m Overrun`
                  : `${item.delta}m Ahead`}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] text-[var(--ff-text-muted)] w-8">Est:</span>
                <div className="flex-1 bg-[var(--ff-border-color)]/30 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--ff-accent)]"
                    style={{ width: `${Math.min(100, (item.estimatedMins / 150) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-[var(--ff-text-primary)] w-10 text-right">
                  {item.estimatedMins}m
                </span>
              </div>

              <div className="flex-1 flex items-center gap-2">
                <span className="text-[10px] text-[var(--ff-text-muted)] w-8">Act:</span>
                <div className="flex-1 bg-[var(--ff-border-color)]/30 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--ff-warning)]"
                    style={{ width: `${Math.min(100, (item.actualMins / 150) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-[var(--ff-text-primary)] w-10 text-right">
                  {item.actualMins}m
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
