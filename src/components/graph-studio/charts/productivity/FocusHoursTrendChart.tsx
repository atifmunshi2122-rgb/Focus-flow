import React, { useMemo, useState } from 'react';
import { FocusSession } from '../../../../types/index.ts';
import { getSessionFocusSeconds } from '../../../../lib/pomodoroAnalytics.ts';
import { DEFAULT_TIMEZONE, formatDateInTimezone } from '../../../../lib/dateTime.ts';
import { useApp } from '../../../../context/AppContext.tsx';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphTooltip } from '../../core/GraphTooltip.tsx';
import { Clock } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface FocusHoursTrendChartProps {
  sessions: FocusSession[];
  dailyGoalMinutes?: number;
  startDateStr: string;
  endDateStr: string;
  onExpand?: () => void;
}

export const FocusHoursTrendChart: React.FC<FocusHoursTrendChartProps> = ({
  sessions,
  dailyGoalMinutes = 120,
  startDateStr,
  endDateStr,
  onExpand,
}) => {
  const { settings } = useApp();
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    title: string;
    subtitle: string;
    items: Array<{ label: string; value: string | number; color?: string }>;
  }>({ visible: false, x: 0, y: 0, title: '', subtitle: '', items: [] });

  const trendData = useMemo(() => {
    // Group completed work sessions by date YYYY-MM-DD
    const dayMap = new Map<string, { minutes: number; count: number }>();

    sessions.forEach((s) => {
      if ((!s.completed && s.status !== 'completed') || s.mode !== 'work') return;
      const d = s.startedAt ? formatDateInTimezone(s.startedAt, timezone) : '';
      if (!d) return;

      const curr = dayMap.get(d) || { minutes: 0, count: 0 };
      curr.minutes += Math.round(getSessionFocusSeconds(s) / 60);
      curr.count += 1;
      dayMap.set(d, curr);
    });

    const start = new Date(`${startDateStr}T12:00:00`);
    const end = new Date(`${endDateStr}T12:00:00`);
    const days: Array<{
      date: string;
      dayName: string;
      minutes: number;
      hours: number;
      sessionsCount: number;
      movingAvgMinutes: number;
    }> = [];

    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      const cur = new Date(start);
      while (cur <= end) {
        const dateStr = formatDateInTimezone(cur, timezone);
        const data = dayMap.get(dateStr) || { minutes: 0, count: 0 };
        const dayName = cur.toLocaleDateString(undefined, { weekday: 'short' });

        days.push({
          date: dateStr,
          dayName,
          minutes: data.minutes,
          hours: Math.round((data.minutes / 60) * 10) / 10,
          sessionsCount: data.count,
          movingAvgMinutes: 0,
        });

        cur.setDate(cur.getDate() + 1);
      }
    }

    // Compute 7-day rolling moving average
    days.forEach((day, idx) => {
      const windowStart = Math.max(0, idx - 6);
      const windowSlice = days.slice(windowStart, idx + 1);
      const sum = windowSlice.reduce((acc, d) => acc + d.minutes, 0);
      day.movingAvgMinutes = Math.round(sum / windowSlice.length);
    });

    // Determine max for bar scaling
    const maxMins = days.reduce((max, d) => Math.max(max, d.minutes, d.movingAvgMinutes), 0) || 60;

    return {
      days,
      maxMins,
      totalMinutes: days.reduce((acc, d) => acc + d.minutes, 0),
    };
  }, [sessions, startDateStr, endDateStr, timezone]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'focus_hours_trend',
      ['Date', 'DayName', 'FocusMinutes', 'FocusHours', 'SessionsCount', '7DayMovingAvgMinutes'],
      trendData.days.map((d) => [
        d.date,
        d.dayName,
        d.minutes,
        d.hours,
        d.sessionsCount,
        d.movingAvgMinutes,
      ])
    );
  };

  return (
    <GraphCard
      id="focus-hours-trend"
      title="Focus Hours & 7-Day Moving Average"
      subtitle={`${(trendData.totalMinutes / 60).toFixed(1)}h completed · Target: ${dailyGoalMinutes}m/day`}
      domain="productivity"
      icon={<Clock className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={trendData.days.length === 0}
      legend={[
        { label: 'Focus Hours (Actual)', color: 'var(--ff-accent)' },
        { label: '7-Day Trend', color: 'var(--ff-warning)' },
      ]}
    >
      <div className="relative pt-4">
        <div
          className={`relative flex items-end justify-between ${
            trendData.days.length > 14 ? 'gap-0.5 sm:gap-1' : 'gap-1.5 sm:gap-3'
          } h-52 px-1 sm:px-2 border-b border-[var(--ff-border-color)]`}
        >
          {/* 7-Day Moving Average Trend Line Overlay */}
          {trendData.days.length > 1 && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-x-1 sm:inset-x-2 top-0 h-36 w-[calc(100%-0.5rem)] sm:w-[calc(100%-1rem)] z-10 overflow-visible"
              aria-hidden="true"
            >
              <polyline
                fill="none"
                stroke="var(--ff-warning)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={trendData.days
                  .map((d, idx) => {
                    const x = ((idx + 0.5) / trendData.days.length) * 100;
                    const y = Math.max(2, Math.min(98, 100 - (d.movingAvgMinutes / trendData.maxMins) * 100));
                    return `${x.toFixed(2)},${y.toFixed(2)}`;
                  })
                  .join(' ')}
              />
            </svg>
          )}

          {trendData.days.map((d, idx) => {
            const barHeightPct = Math.max(4, Math.round((d.minutes / trendData.maxMins) * 100));
            const isMet = d.minutes >= dailyGoalMinutes;
            const showLabel =
              trendData.days.length <= 14 ||
              idx === 0 ||
              idx === trendData.days.length - 1 ||
              idx % 3 === 0;

            return (
              <div
                key={d.date}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    visible: true,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    title: `${d.dayName}, ${d.date}`,
                    subtitle: `${d.sessionsCount} sessions`,
                    items: [
                      {
                        label: 'Focus Time',
                        value: `${d.hours}h (${d.minutes}m)`,
                        color: isMet ? 'var(--ff-success)' : 'var(--ff-accent)',
                      },
                      {
                        label: '7-Day Avg',
                        value: `${Math.round(d.movingAvgMinutes / 60)}h ${d.movingAvgMinutes % 60}m`,
                        color: 'var(--ff-warning)',
                      },
                    ],
                  });
                }}
                onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
                className="flex-1 min-w-0 flex flex-col items-center gap-1.5 group cursor-pointer"
              >
                <div className="w-full flex items-end justify-center h-36 relative">
                  {/* Goal Reference Line indicator if active */}
                  <div
                    className="w-full max-w-[28px] rounded-t-sm transition-all duration-300 group-hover:scale-y-105 origin-bottom"
                    style={{
                      height: `${barHeightPct}%`,
                      backgroundColor: isMet
                        ? 'var(--ff-success)'
                        : 'var(--ff-accent)',
                    }}
                  />
                </div>

                <span className="text-[9px] sm:text-[10px] font-mono font-medium text-[var(--ff-text-muted)] group-hover:text-[var(--ff-text-primary)] h-4 leading-4">
                  {showLabel ? d.date.slice(8) : ''}
                </span>
              </div>
            );
          })}
        </div>

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
