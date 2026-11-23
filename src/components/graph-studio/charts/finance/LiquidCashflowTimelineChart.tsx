import React, { useMemo, useState } from 'react';
import { IncomeTransaction, ExpenseTransaction, CurrencyCode } from '../../../../types/index.ts';
import { formatCurrency } from '../../../../lib/currency.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphSvgContainer } from '../../core/GraphSvgContainer.tsx';
import { GraphTooltip } from '../../core/GraphTooltip.tsx';
import { scaleLinear, getNiceTicks } from '../../core/GraphScales.ts';
import { generateSmoothSplinePath, generateAreaPath } from '../../core/GraphPathGenerators.ts';
import { TrendingUp, ShieldAlert } from 'lucide-react';
import { ThemeBadge } from '../../../ui/ThemePrimitives.tsx';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface LiquidCashflowTimelineChartProps {
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  currency?: CurrencyCode;
  onExpand?: () => void;
}

export const LiquidCashflowTimelineChart: React.FC<LiquidCashflowTimelineChartProps> = ({
  incomes,
  expenses,
  currency = 'INR',
  onExpand,
}) => {
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    title: string;
    subtitle: string;
    items: Array<{ label: string; value: string | number; color?: string }>;
  }>({ visible: false, x: 0, y: 0, title: '', subtitle: '', items: [] });

  const timelineData = useMemo(() => {
    // Merge incomes and expenses into a daily balance change
    const dayMap = new Map<string, number>();

    incomes.forEach((i) => {
      if (i.deletedAt || !i.date) return;
      dayMap.set(i.date, (dayMap.get(i.date) || 0) + i.amountPaise);
    });

    expenses.forEach((e) => {
      if (e.deletedAt || !e.date) return;
      dayMap.set(e.date, (dayMap.get(e.date) || 0) - e.amountPaise);
    });

    const sortedDates = Array.from(dayMap.keys()).sort();
    if (sortedDates.length === 0) return { points: [], minVal: 0, maxVal: 0 };

    let cumulative = 0;
    const points: Array<{ date: string; balancePaise: number }> = [];

    sortedDates.forEach((date) => {
      cumulative += dayMap.get(date) || 0;
      points.push({ date, balancePaise: cumulative });
    });

    const balances = points.map((p) => p.balancePaise);
    const minVal = Math.min(0, ...balances);
    const maxVal = Math.max(1, ...balances);

    return { points, minVal, maxVal };
  }, [incomes, expenses]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'liquid_cashflow_timeline',
      ['Date', 'CumulativeBalancePaise'],
      timelineData.points.map((p) => [p.date, p.balancePaise])
    );
  };

  return (
    <GraphCard
      id="liquid-cashflow-timeline"
      title="Cumulative Liquid Cashflow Timeline"
      subtitle="Running net cash balance derived strictly from verified ledger entries"
      domain="finance"
      icon={<TrendingUp className="w-4 h-4" />}
      badge={<ThemeBadge tone="success">Verified Ledger</ThemeBadge>}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={timelineData.points.length < 2}
      emptyTitle="Insufficient ledger history"
      emptyDescription="Record at least two dates of income or expense transactions to plot the cumulative trajectory."
    >
      <div className="relative pt-2">
        <GraphSvgContainer viewBoxWidth={700} viewBoxHeight={240}>
          {({ viewBoxWidth, viewBoxHeight }) => {
            const padL = 60;
            const padR = 20;
            const padT = 20;
            const padB = 35;

            const plotW = viewBoxWidth - padL - padR;
            const plotH = viewBoxHeight - padT - padB;

            const n = timelineData.points.length;
            const domainY: [number, number] = [timelineData.minVal, timelineData.maxVal];
            const rangeY: [number, number] = [padT + plotH, padT];

            const zeroY = scaleLinear(0, domainY, rangeY);

            const screenPoints = timelineData.points.map((p, idx) => ({
              x: padL + (idx / Math.max(1, n - 1)) * plotW,
              y: scaleLinear(p.balancePaise, domainY, rangeY),
              raw: p,
            }));

            const linePath = generateSmoothSplinePath(screenPoints);
            const areaPath = generateAreaPath(screenPoints, zeroY);

            const ticks = getNiceTicks(timelineData.minVal, timelineData.maxVal, 4);

            return (
              <svg
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                className="w-full h-auto overflow-visible select-none"
                role="img"
                aria-label="Cumulative Liquid Cashflow Timeline"
              >
                <defs>
                  <linearGradient id="liquidAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--ff-success)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--ff-success)" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Grid Lines & Ticks */}
                {ticks.map((val) => {
                  const y = scaleLinear(val, domainY, rangeY);
                  return (
                    <g key={val} className="opacity-40">
                      <line
                        x1={padL}
                        y1={y}
                        x2={viewBoxWidth - padR}
                        y2={y}
                        stroke="var(--ff-border-color)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 8}
                        y={y + 3}
                        textAnchor="end"
                        fontSize="10"
                        fill="var(--ff-text-muted)"
                        fontFamily="monospace"
                      >
                        {formatCurrency(val, currency as CurrencyCode)}
                      </text>
                    </g>
                  );
                })}

                {/* Baseline Zero Line */}
                <line
                  x1={padL}
                  y1={zeroY}
                  x2={viewBoxWidth - padR}
                  y2={zeroY}
                  stroke="var(--ff-border-color)"
                  strokeWidth="1.5"
                />

                {/* Area Fill */}
                <path d={areaPath} fill="url(#liquidAreaGrad)" />

                {/* Spline Path */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--ff-success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Interactive Points */}
                {screenPoints.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={3.5}
                    fill="var(--ff-surface-card)"
                    stroke="var(--ff-success)"
                    strokeWidth="2"
                    className="hover:r-5 transition-all cursor-pointer"
                    onMouseEnter={() => {
                      setTooltip({
                        visible: true,
                        x: pt.x,
                        y: pt.y,
                        title: pt.raw.date,
                        subtitle: `Liquid Balance`,
                        items: [
                          {
                            label: 'Cumulative Cash',
                            value: formatCurrency(pt.raw.balancePaise, currency as CurrencyCode),
                            color: 'var(--ff-success)',
                          },
                        ],
                      });
                    }}
                    onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
                  />
                ))}

                {/* X-Axis First & Last Date Labels */}
                {timelineData.points.length > 0 && (
                  <g className="text-[10px] font-mono fill-[var(--ff-text-muted)]">
                    <text x={padL} y={viewBoxHeight - 10} textAnchor="start">
                      {timelineData.points[0].date}
                    </text>
                    <text x={viewBoxWidth - padR} y={viewBoxHeight - 10} textAnchor="end">
                      {timelineData.points[timelineData.points.length - 1].date}
                    </text>
                  </g>
                )}
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

        {/* Institutional Ledger Bounds Notice */}
        <div className="mt-2 pt-2 border-t border-[var(--ff-border-color)]/60 flex items-center justify-between text-[11px] text-[var(--ff-text-muted)]">
          <span>Bounds: Liquid operating transactions only</span>
          <span className="flex items-center gap-1 text-[var(--ff-text-muted)]">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            Institutional Assets &amp; Liabilities Not Connected
          </span>
        </div>
      </div>
    </GraphCard>
  );
};
