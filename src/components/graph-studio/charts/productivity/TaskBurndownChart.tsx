import React, { useMemo } from 'react';
import { Task } from '../../../../types/index.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphSvgContainer } from '../../core/GraphSvgContainer.tsx';
import { scaleLinear } from '../../core/GraphScales.ts';
import { generateStepPath } from '../../core/GraphPathGenerators.ts';
import { TrendingDown } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface TaskBurndownChartProps {
  tasks: Task[];
  startDateStr: string;
  endDateStr: string;
  onExpand?: () => void;
}

export const TaskBurndownChart: React.FC<TaskBurndownChartProps> = ({
  tasks,
  startDateStr,
  endDateStr,
  onExpand,
}) => {
  const burndownData = useMemo(() => {
    const totalCount = tasks.length;
    if (totalCount === 0) return { days: [], maxOpen: 0 };

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const days: Array<{ date: string; remaining: number }> = [];

    let remaining = totalCount;
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const cur = new Date(start);
      while (cur <= end) {
        const dateStr = cur.toISOString().slice(0, 10);
        // Completed on this day
        const completedToday = tasks.filter(
          (t) => t.status === 'completed' && t.completedAt && t.completedAt.slice(0, 10) === dateStr
        ).length;

        remaining = Math.max(0, remaining - completedToday);
        days.push({ date: dateStr, remaining });
        cur.setDate(cur.getDate() + 1);
      }
    }

    return { days, maxOpen: totalCount };
  }, [tasks, startDateStr, endDateStr]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'task_burndown',
      ['Date', 'RemainingTasks'],
      burndownData.days.map((d) => [d.date, d.remaining])
    );
  };

  return (
    <GraphCard
      id="task-burndown"
      title="Task Burndown & Backlog Depletion"
      subtitle="Actual task resolution pacing vs ideal target burn rate"
      domain="productivity"
      icon={<TrendingDown className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={burndownData.days.length === 0}
      legend={[
        { label: 'Actual Remaining', color: 'var(--ff-accent)' },
        { label: 'Ideal Linear Pace', color: 'var(--ff-border-color)', isDashed: true },
      ]}
    >
      <div className="relative pt-2">
        <GraphSvgContainer viewBoxWidth={700} viewBoxHeight={240}>
          {({ viewBoxWidth, viewBoxHeight }) => {
            const padL = 50;
            const padR = 20;
            const padT = 20;
            const padB = 30;

            const plotW = viewBoxWidth - padL - padR;
            const plotH = viewBoxHeight - padT - padB;

            const n = burndownData.days.length;
            const domainY: [number, number] = [0, burndownData.maxOpen || 10];
            const rangeY: [number, number] = [padT + plotH, padT];

            const screenPoints = burndownData.days.map((p, idx) => ({
              x: padL + (idx / Math.max(1, n - 1)) * plotW,
              y: scaleLinear(p.remaining, domainY, rangeY),
            }));

            const stepPath = generateStepPath(screenPoints);

            // Ideal Line from (padL, padT) to (padL + plotW, padT + plotH)
            const idealX1 = padL;
            const idealY1 = scaleLinear(burndownData.maxOpen, domainY, rangeY);
            const idealX2 = padL + plotW;
            const idealY2 = scaleLinear(0, domainY, rangeY);

            return (
              <svg
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                className="w-full h-auto overflow-visible select-none"
                role="img"
                aria-label="Task Burndown Chart"
              >
                {/* Y-Axis Guideline */}
                <line
                  x1={padL}
                  y1={padT + plotH}
                  x2={viewBoxWidth - padR}
                  y2={padT + plotH}
                  stroke="var(--ff-border-color)"
                  strokeWidth="1.5"
                />

                {/* Ideal Guide Line (Dashed) */}
                <line
                  x1={idealX1}
                  y1={idealY1}
                  x2={idealX2}
                  y2={idealY2}
                  stroke="var(--ff-border-color)"
                  strokeDasharray="4 4"
                  strokeWidth="2"
                />

                {/* Actual Stepped Line */}
                <path
                  d={stepPath}
                  fill="none"
                  stroke="var(--ff-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Ticks */}
                <text
                  x={padL - 8}
                  y={idealY1 + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--ff-text-muted)"
                  fontFamily="monospace"
                >
                  {burndownData.maxOpen}
                </text>
                <text
                  x={padL - 8}
                  y={idealY2 + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--ff-text-muted)"
                  fontFamily="monospace"
                >
                  0
                </text>

                {/* Date labels */}
                {burndownData.days.length > 0 && (
                  <g className="text-[10px] font-mono fill-[var(--ff-text-muted)]">
                    <text x={padL} y={viewBoxHeight - 8} textAnchor="start">
                      {burndownData.days[0].date}
                    </text>
                    <text x={viewBoxWidth - padR} y={viewBoxHeight - 8} textAnchor="end">
                      {burndownData.days[burndownData.days.length - 1].date}
                    </text>
                  </g>
                )}
              </svg>
            );
          }}
        </GraphSvgContainer>
      </div>
    </GraphCard>
  );
};
