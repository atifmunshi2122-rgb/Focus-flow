import React, { useMemo } from 'react';
import { FocusSession } from '../../../../types/index.ts';
import { StudySubject } from '../../../../types/study.ts';
import { getSessionFocusSeconds } from '../../../../lib/pomodoroAnalytics.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { AnimatedProgressBar } from '../../../ui/MotionPrimitives.tsx';
import { Layers } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface SubjectStudyHoursChartProps {
  sessions: FocusSession[];
  subjects: StudySubject[];
  onSelectSubject?: (subjectCode: string) => void;
  onExpand?: () => void;
}

export const SubjectStudyHoursChart: React.FC<SubjectStudyHoursChartProps> = ({
  sessions,
  subjects,
  onSelectSubject,
  onExpand,
}) => {
  const subjectMap = useMemo(() => {
    const map = new Map<string, StudySubject>();
    subjects.forEach((s) => {
      map.set(s.code, s);
      map.set(s.id, s);
    });
    return map;
  }, [subjects]);

  const stats = useMemo(() => {
    const hoursMap = new Map<string, { subjectCode: string; name: string; minutes: number; sessionCount: number; color?: string }>();

    sessions.forEach((s) => {
      if (!s.completed && s.status !== 'completed') return;
      const code = s.subjectCode || s.subjectId;
      if (!code) return;

      const sub = subjectMap.get(code);
      const name = sub?.name || code;
      const color = sub?.color || 'var(--ff-accent)';

      const current = hoursMap.get(code) || { subjectCode: code, name, minutes: 0, sessionCount: 0, color };
      current.minutes += Math.round(getSessionFocusSeconds(s) / 60);
      current.sessionCount += 1;
      hoursMap.set(code, current);
    });

    const list = Array.from(hoursMap.values()).sort((a, b) => b.minutes - a.minutes);
    const totalMinutes = list.reduce((acc, item) => acc + item.minutes, 0);

    return {
      list: list.map((item) => ({
        ...item,
        percentage: totalMinutes > 0 ? Math.round((item.minutes / totalMinutes) * 100) : 0,
        hours: (item.minutes / 60).toFixed(1),
      })),
      totalMinutes,
    };
  }, [sessions, subjectMap]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'subject_study_hours',
      ['SubjectCode', 'SubjectName', 'StudyMinutes', 'Hours', 'Percentage', 'SessionCount'],
      stats.list.map((s) => [s.subjectCode, s.name, s.minutes, s.hours, s.percentage, s.sessionCount])
    );
  };

  return (
    <GraphCard
      id="subject-study-hours"
      title="Subject-Wise Study Hours"
      subtitle={`${stats.list.length} subjects with logged deep work`}
      domain="study"
      icon={<Layers className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={stats.list.length === 0}
      emptyTitle="No subject study sessions logged"
      emptyDescription="Tag your Pomodoro sessions with study subjects to track curriculum focus."
    >
      <div className="space-y-3.5 pt-1">
        {stats.list.map((item) => (
          <div
            key={item.subjectCode}
            onClick={() => onSelectSubject?.(item.subjectCode)}
            className="space-y-1.5 p-2 rounded-xl hover:bg-[var(--ff-surface-subtle)] transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                  {item.name}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                  {item.subjectCode}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                  {item.hours}h
                </span>
                <span className="text-[11px] font-mono text-[var(--ff-text-muted)] w-10 text-right">
                  {item.percentage}%
                </span>
              </div>
            </div>

            <AnimatedProgressBar
              value={Math.max(3, item.percentage)}
              customColor={item.color}
              heightClass="h-2"
              ariaLabel={`${item.name} focus share`}
            />
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
