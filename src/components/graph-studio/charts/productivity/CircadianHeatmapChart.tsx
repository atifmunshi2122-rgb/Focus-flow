import React, { useMemo, useState } from 'react';
import { FocusSession } from '../../../../types/index.ts';
import { getSessionFocusSeconds } from '../../../../lib/pomodoroAnalytics.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphTooltip } from '../../core/GraphTooltip.tsx';
import { Sun } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface CircadianHeatmapChartProps {
  sessions: FocusSession[];
  onExpand?: () => void;
}

export const CircadianHeatmapChart: React.FC<CircadianHeatmapChartProps> = ({
  sessions,
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

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, '0')}:00`,
      minutes: 0,
      sessionCount: 0,
    }));

    sessions.forEach((s) => {
      if ((!s.completed && s.status !== 'completed') || s.mode !== 'work' || !s.startedAt) return;
      try {
        const d = new Date(s.startedAt);
        const h = d.getHours();
        if (h >= 0 && h < 24) {
          hours[h].minutes += Math.round(getSessionFocusSeconds(s) / 60);
          hours[h].sessionCount += 1;
        }
      } catch {
        // ignore
      }
    });

    const maxMins = Math.max(1, ...hours.map((h) => h.minutes));
    const peakHour = hours.reduce((peak, curr) => (curr.minutes > peak.minutes ? curr : peak), hours[0]);

    return {
      hours: hours.map((h) => ({
        ...h,
        heightPct: Math.max(4, Math.round((h.minutes / maxMins) * 100)),
        isPeak: h.hour === peakHour.hour && peakHour.minutes > 0,
      })),
      peakHour,
    };
  }, [sessions]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'circadian_hourly_productivity',
      ['Hour', 'TimeLabel', 'FocusMinutes', 'SessionCount'],
      hourlyData.hours.map((h) => [h.hour, h.label, h.minutes, h.sessionCount])
    );
  };

  return (
    <GraphCard
      id="circadian-heatmap"
      title="Hour-of-Day Productivity Heatmap"
      subtitle={
        hourlyData.peakHour.minutes > 0
          ? `Peak flow window around ${hourlyData.peakHour.label} (${Math.round(hourlyData.peakHour.minutes / 60)}h logged)`
          : '24-hour distribution of deep work'
      }
      domain="productivity"
      icon={<Sun className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={hourlyData.peakHour.minutes === 0}
      emptyTitle="No hourly focus data"
      emptyDescription="Run completed Pomodoro sessions throughout the day to discover your biological peak hours."
      legend={[
        { label: 'Normal Hours', color: 'var(--ff-accent)' },
        { label: 'Peak Flow Hour', color: 'var(--ff-warning)' },
      ]}
    >
      <div className="relative pt-4">
        <div className="flex items-end justify-between gap-1 sm:gap-1.5 h-48 px-1 border-b border-[var(--ff-border-color)]">
          {hourlyData.hours.map((h) => (
            <div
              key={h.hour}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  visible: true,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  title: `${h.label} - ${String((h.hour + 1) % 24).padStart(2, '0')}:00`,
                  subtitle: h.isPeak ? 'Golden Focus Hour' : 'Standard Focus',
                  items: [
                    {
                      label: 'Focus Time',
                      value: `${Math.floor(h.minutes / 60)}h ${h.minutes % 60}m`,
                      color: h.isPeak ? 'var(--ff-warning)' : 'var(--ff-accent)',
                    },
                    { label: 'Sessions', value: h.sessionCount, color: 'var(--ff-info)' },
                  ],
                });
              }}
              onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
              className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
            >
              <div className="w-full flex items-end justify-center h-32">
                <div
                  className="w-full rounded-t-xs transition-all duration-300 group-hover:scale-y-110 origin-bottom"
                  style={{
                    height: `${h.heightPct}%`,
                    backgroundColor: h.isPeak
                      ? 'var(--ff-warning)'
                      : h.minutes > 0
                      ? 'var(--ff-accent)'
                      : 'var(--ff-surface-subtle)',
                  }}
                />
              </div>

              {h.hour % 3 === 0 && (
                <span className="text-[9px] font-mono text-[var(--ff-text-muted)] group-hover:text-[var(--ff-text-primary)]">
                  {h.hour}
                </span>
              )}
            </div>
          ))}
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
