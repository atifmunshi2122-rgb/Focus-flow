import React, { useMemo, useState } from 'react';
import { Habit } from '../../../../types/index.ts';
import {
  aggregateHabitCompletionTrends,
  HabitCompletionTrendItem,
} from '../../core/graphDataAggregator.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphSvgContainer } from '../../core/GraphSvgContainer.tsx';
import { GraphTooltip } from '../../core/GraphTooltip.tsx';
import { scaleLinear } from '../../core/GraphScales.ts';
import { CheckCircle2 } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface HabitCompletionTrendChartProps {
  habits: Habit[];
  initialMode?: 'weekly' | 'monthly';
  activeUserId?: string | null;
  onExpand?: () => void;
}

export const HabitCompletionTrendChart: React.FC<HabitCompletionTrendChartProps> = ({
  habits,
  initialMode = 'weekly',
  activeUserId,
  onExpand,
}) => {
  const [mode, setMode] = useState<'weekly' | 'monthly'>(initialMode);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    title: string;
    subtitle: string;
    items: Array<{ label: string; value: string | number; color?: string }>;
  }>({ visible: false, x: 0, y: 0, title: '', subtitle: '', items: [] });

  const trends: HabitCompletionTrendItem[] = useMemo(() => {
    return aggregateHabitCompletionTrends(habits, mode, activeUserId);
  }, [habits, mode, activeUserId]);

  const totalCompleted = trends.reduce((sum, item) => sum + item.completedCount, 0);
  const totalScheduled = trends.reduce((sum, item) => sum + item.scheduledCount, 0);
  const overallRate = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

  const handleExportCsv = () => {
    exportDatasetToCsv(
      `habit_${mode}_completion_trend`,
      ['PeriodKey', 'PeriodLabel', 'ScheduledHabits', 'CompletedHabits', 'CompletionRatePct'],
      trends.map((t) => [t.periodKey, t.periodLabel, t.scheduledCount, t.completedCount, `${t.completionRate}%`])
    );
  };

  return (
    <GraphCard
      id={`habit-${mode}-trend`}
      title={mode === 'weekly' ? 'Weekly Habit Completion Trend' : 'Monthly Habit Completion Trend'}
      subtitle={`${overallRate}% average adherence (${totalCompleted}/${totalScheduled} executions)`}
      domain="habits"
      icon={<CheckCircle2 className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={trends.length === 0 || totalScheduled === 0}
      emptyTitle={`No ${mode} habit execution logs`}
      emptyDescription="Execute and mark daily habits to track recurring adherence across weeks and months."
      badge={
        <div className="flex items-center rounded-lg bg-[var(--ff-surface-subtle)] p-0.5 border border-[var(--ff-border-color)] text-[10px]">
          <button
            type="button"
            onClick={() => setMode('weekly')}
            className={`px-2 py-0.5 rounded font-semibold transition-all ${
              mode === 'weekly'
                ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
            }`}
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => setMode('monthly')}
            className={`px-2 py-0.5 rounded font-semibold transition-all ${
              mode === 'monthly'
                ? 'bg-[var(--ff-surface-card)] text-[var(--ff-accent-text)] shadow-xs'
                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
            }`}
          >
            Monthly
          </button>
        </div>
      }
      legend={[
        { label: 'Completed Rate (%)', color: 'var(--ff-success)' },
        { label: 'Scheduled Baseline', color: 'var(--ff-border-color)' },
      ]}
    >
      <div className="relative pt-2">
        <GraphSvgContainer viewBoxWidth={700} viewBoxHeight={240}>
          {({ viewBoxWidth, viewBoxHeight }) => {
            const padL = 40;
            const padR = 20;
            const padT = 20;
            const padB = 30;

            const plotW = viewBoxWidth - padL - padR;
            const plotH = viewBoxHeight - padT - padB;
            const baselineY = padT + plotH;

            const n = trends.length;
            const colWidth = Math.min(50, Math.max(20, (plotW / Math.max(1, n)) * 0.55));
            const slotWidth = plotW / Math.max(1, n);

            // Rate domain is 0 to 100%
            const domainY: [number, number] = [0, 100];
            const rangeY: [number, number] = [baselineY, padT];

            return (
              <svg
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                className="w-full h-auto overflow-visible select-none"
                role="img"
                aria-label={`${mode === 'weekly' ? 'Weekly' : 'Monthly'} Habit Completion Trend`}
              >
                {/* Horizontal reference grid lines at 50% and 100% */}
                {[0, 50, 100].map((val) => {
                  const y = scaleLinear(val, domainY, rangeY);
                  return (
                    <g key={val}>
                      <line
                        x1={padL}
                        y1={y}
                        x2={viewBoxWidth - padR}
                        y2={y}
                        stroke="var(--ff-border-color)"
                        strokeDasharray={val === 0 ? undefined : '3,3'}
                        strokeWidth={val === 0 ? '1.5' : '1'}
                        opacity={val === 0 ? 1 : 0.6}
                      />
                      <text
                        x={padL - 6}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="9"
                        fill="var(--ff-text-muted)"
                        fontFamily="monospace"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}

                {/* Bars & Interactive Regions */}
                {trends.map((item, idx) => {
                  const centerX = padL + idx * slotWidth + slotWidth / 2;
                  const barX = centerX - colWidth / 2;
                  const rateY = scaleLinear(item.completionRate, domainY, rangeY);
                  const barH = Math.max(0, baselineY - rateY);

                  return (
                    <g
                      key={item.periodKey}
                      className="cursor-pointer group"
                      onMouseEnter={() => {
                        setTooltip({
                          visible: true,
                          x: centerX,
                          y: rateY,
                          title: item.periodLabel,
                          subtitle: `${item.completedCount} of ${item.scheduledCount} habits completed`,
                          items: [
                            {
                              label: 'Adherence Rate',
                              value: `${item.completionRate}%`,
                              color: 'var(--ff-success)',
                            },
                            {
                              label: 'Completed',
                              value: item.completedCount,
                              color: 'var(--ff-accent-text)',
                            },
                            {
                              label: 'Scheduled',
                              value: item.scheduledCount,
                              color: 'var(--ff-text-muted)',
                            },
                          ],
                        });
                      }}
                      onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
                    >
                      {/* Background Track (100% height) */}
                      <rect
                        x={barX}
                        y={padT}
                        width={colWidth}
                        height={plotH}
                        rx={4}
                        fill="var(--ff-surface-subtle)"
                        opacity={0.7}
                      />

                      {/* Foreground Progress Bar */}
                      <rect
                        x={barX}
                        y={rateY}
                        width={colWidth}
                        height={barH}
                        rx={4}
                        fill={
                          item.completionRate >= 80
                            ? 'var(--ff-success)'
                            : item.completionRate >= 50
                            ? 'var(--ff-accent)'
                            : 'var(--ff-warning)'
                        }
                        className="transition-all duration-200 group-hover:brightness-110"
                      />

                      {/* Value label above bar */}
                      {item.scheduledCount > 0 && (
                        <text
                          x={centerX}
                          y={rateY - 5}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="600"
                          fill="var(--ff-text-primary)"
                          fontFamily="monospace"
                        >
                          {item.completionRate}%
                        </text>
                      )}

                      {/* X-Axis Label */}
                      <text
                        x={centerX}
                        y={viewBoxHeight - 8}
                        textAnchor="middle"
                        fontSize="9.5"
                        fill="var(--ff-text-muted)"
                        fontFamily="monospace"
                      >
                        {item.periodLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
            );
          }}
        </GraphSvgContainer>

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
