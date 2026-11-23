import React, { useMemo, useState } from 'react';
import { FocusSession } from '../../../../types/index.ts';
import { StudyActivityLog } from '../../../../types/study.ts';
import { getSessionFocusSeconds } from '../../../../lib/pomodoroAnalytics.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { GraphTooltip } from '../../core/GraphTooltip.tsx';
import { BookOpen } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface StudyActivityHeatmapChartProps {
  sessions: FocusSession[];
  activityLogs: StudyActivityLog[];
  startDateStr: string;
  endDateStr: string;
  onSelectDate?: (dateStr: string) => void;
  onExpand?: () => void;
}

export const StudyActivityHeatmapChart: React.FC<StudyActivityHeatmapChartProps> = ({
  sessions,
  activityLogs,
  startDateStr,
  endDateStr,
  onSelectDate,
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

  // Map study minutes by date YYYY-MM-DD
  const dailyMap = useMemo(() => {
    const map = new Map<string, { minutes: number; sessionsCount: number; subjects: Set<string> }>();

    sessions.forEach((s) => {
      if (!s.completed && s.status !== 'completed') return;
      // Filter for study-specific work
      const isStudy = s.activityType === 'study' || Boolean(s.subjectCode) || s.mode === 'work';
      if (!isStudy) return;

      const dateStr = s.startedAt ? s.startedAt.slice(0, 10) : '';
      if (!dateStr) return;

      const current = map.get(dateStr) || { minutes: 0, sessionsCount: 0, subjects: new Set<string>() };
      const mins = Math.round(getSessionFocusSeconds(s) / 60);
      current.minutes += mins;
      current.sessionsCount += 1;
      if (s.subjectCode) current.subjects.add(s.subjectCode);
      map.set(dateStr, current);
    });

    activityLogs.forEach((log) => {
      const dateStr = log.activityDate || (log.createdAt ? log.createdAt.slice(0, 10) : '');
      if (!dateStr) return;
      const current = map.get(dateStr) || { minutes: 0, sessionsCount: 0, subjects: new Set<string>() };
      if (log.subjectId) current.subjects.add(log.subjectId);
      map.set(dateStr, current);
    });

    return map;
  }, [sessions, activityLogs]);

  // Generate date array from startDateStr to endDateStr
  const dateCells = useMemo(() => {
    const cells: Array<{ date: string; minutes: number; sessionsCount: number; subjectsCount: number }> = [];
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return cells;
    }

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10);
      const data = dailyMap.get(dateStr);
      cells.push({
        date: dateStr,
        minutes: data?.minutes || 0,
        sessionsCount: data?.sessionsCount || 0,
        subjectsCount: data?.subjects.size || 0,
      });
      current.setDate(current.getDate() + 1);
    }
    return cells;
  }, [startDateStr, endDateStr, dailyMap]);

  const totalStudyMinutes = useMemo(() => {
    return dateCells.reduce((acc, c) => acc + c.minutes, 0);
  }, [dateCells]);

  const activeDaysCount = useMemo(() => {
    return dateCells.filter((c) => c.minutes > 0).length;
  }, [dateCells]);

  const getHeatColor = (mins: number) => {
    if (mins <= 0) return 'var(--ff-surface-subtle)';
    if (mins < 30) return 'color-mix(in oklab, var(--ff-accent) 30%, transparent)';
    if (mins < 75) return 'color-mix(in oklab, var(--ff-accent) 55%, transparent)';
    if (mins < 120) return 'color-mix(in oklab, var(--ff-accent) 80%, transparent)';
    return 'var(--ff-accent)';
  };

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'study_activity_heatmap',
      ['Date', 'StudyMinutes', 'SessionsCount', 'SubjectsCount'],
      dateCells.map((c) => [c.date, c.minutes, c.sessionsCount, c.subjectsCount])
    );
  };

  return (
    <GraphCard
      id="study-activity-heatmap"
      title="Study Activity Heatmap"
      subtitle={`${Math.round(totalStudyMinutes / 60)}h ${totalStudyMinutes % 60}m across ${activeDaysCount} active days`}
      domain="study"
      icon={<BookOpen className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={dateCells.length === 0}
      legend={[
        { label: '0m', color: 'var(--ff-surface-subtle)' },
        { label: '<30m', color: 'color-mix(in oklab, var(--ff-accent) 30%, transparent)' },
        { label: '30-75m', color: 'color-mix(in oklab, var(--ff-accent) 55%, transparent)' },
        { label: '75-120m', color: 'color-mix(in oklab, var(--ff-accent) 80%, transparent)' },
        { label: '120m+', color: 'var(--ff-accent)' },
      ]}
    >
      <div className="relative pt-2">
        <div className="grid grid-cols-7 sm:grid-cols-14 md:grid-cols-21 lg:grid-cols-28 gap-1.5 p-1 max-h-56 overflow-y-auto">
          {dateCells.map((cell) => (
            <div
              key={cell.date}
              onClick={() => onSelectDate?.(cell.date)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  visible: true,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  title: cell.date,
                  subtitle: `${cell.minutes} minutes`,
                  items: [
                    { label: 'Study Time', value: `${Math.floor(cell.minutes / 60)}h ${cell.minutes % 60}m`, color: 'var(--ff-accent)' },
                    { label: 'Sessions', value: cell.sessionsCount, color: 'var(--ff-info)' },
                  ],
                });
              }}
              onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
              className="aspect-square rounded-xs border border-[var(--ff-border-color)] transition-transform hover:scale-125 cursor-pointer"
              style={{ backgroundColor: getHeatColor(cell.minutes) }}
            />
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
