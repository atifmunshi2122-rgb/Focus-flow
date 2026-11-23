import React, { useMemo, useState } from 'react';
import { FocusSession } from '../../../../types/index.ts';
import { aggregateStudyTrends, StudyTrendBucket } from '../../core/graphDataAggregator.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphSvgContainer } from '../../core/GraphSvgContainer.tsx';
import { GraphTooltip } from '../../core/GraphTooltip.tsx';
import { scaleLinear } from '../../core/GraphScales.ts';
import { generateSmoothSplinePath, generateAreaPath } from '../../core/GraphPathGenerators.ts';
import { TrendingUp } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface StudyTrendsVelocityChartProps {
  sessions: FocusSession[];
  initialMode?: 'weekly' | 'monthly';
  timezone?: string;
  activeUserId?: string | null;
  onExpand?: () => void;
}

export const StudyTrendsVelocityChart: React.FC<StudyTrendsVelocityChartProps> = ({
  sessions,
  initialMode = 'weekly',
  timezone,
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

  const trendData = useMemo(() => {
    return aggregateStudyTrends(sessions, mode, timezone, activeUserId);
  }, [sessions, mode, timezone, activeUserId]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      `study_${mode}_trend`,
      ['PeriodKey', 'PeriodLabel', 'StudyMinutes', 'StudyHours', 'SessionCount'],
      trendData.buckets.map((b) => [b.periodKey, b.periodLabel, b.minutes, b.hours, b.sessionCount])
    );
  };

  return (
    <GraphCard
      id={`study-${mode}-trend`}
      title={mode === 'weekly' ? 'Weekly Study Trend' : 'Monthly Study Trend'}
      subtitle={`${Math.round(trendData.totalMinutes / 60)} hours total study volume over ${trendData.buckets.length} periods`}
      domain="study"
      icon={<TrendingUp className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={trendData.buckets.length === 0}
      emptyTitle={`No ${mode} study sessions recorded`}
      emptyDescription="Log study Pomodoro sessions to generate weekly and monthly pacing curves."
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
      legend={[{ label: 'Study Hours', color: 'var(--ff-accent)' }]}
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

            const n = trendData.buckets.length;
            const domainY: [number, number] = [0, trendData.maxMinutes || 60];
            const rangeY: [number, number] = [padT + plotH, padT];
            const baselineY = padT + plotH;

            const screenPoints = trendData.buckets.map((b, idx) => ({
              x: padL + (idx / Math.max(1, n - 1)) * plotW,
              y: scaleLinear(b.minutes, domainY, rangeY),
              raw: b,
            }));

            const linePath = generateSmoothSplinePath(screenPoints);
            const areaPath = generateAreaPath(screenPoints, baselineY);

            return (
              <svg
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                className="w-full h-auto overflow-visible select-none"
                role="img"
                aria-label={`${mode === 'weekly' ? 'Weekly' : 'Monthly'} Study Trend`}
              >
                <defs>
                  <linearGradient id="studyTrendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ff-accent)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--ff-accent)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Baseline */}
                <line
                  x1={padL}
                  y1={baselineY}
                  x2={viewBoxWidth - padR}
                  y2={baselineY}
                  stroke="var(--ff-border-color)"
                  strokeWidth="1.5"
                />

                {/* Area Fill */}
                <path d={areaPath} fill="url(#studyTrendAreaGrad)" />

                {/* Spline Path */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--ff-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Interactive Points */}
                {screenPoints.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={4}
                    fill="var(--ff-surface-card)"
                    stroke="var(--ff-accent)"
                    strokeWidth="2"
                    className="hover:r-5.5 transition-all cursor-pointer"
                    onMouseEnter={() => {
                      setTooltip({
                        visible: true,
                        x: pt.x,
                        y: pt.y,
                        title: pt.raw.periodLabel,
                        subtitle: `${pt.raw.sessionCount} study sessions`,
                        items: [
                          {
                            label: 'Study Time',
                            value: `${pt.raw.hours}h (${pt.raw.minutes}m)`,
                            color: 'var(--ff-accent)',
                          },
                        ],
                      });
                    }}
                    onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
                  />
                ))}

                {/* Axis Labels */}
                {screenPoints.map((pt, idx) => (
                  <text
                    key={idx}
                    x={pt.x}
                    y={viewBoxHeight - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--ff-text-muted)"
                    fontFamily="monospace"
                  >
                    {pt.raw.periodLabel}
                  </text>
                ))}
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

