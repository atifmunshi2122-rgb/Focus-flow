import React, { useMemo } from 'react';
import { StudySubject, StudyTopic } from '../../../../types/study.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { CheckCircle2 } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface SyllabusTriadProgressChartProps {
  subjects: StudySubject[];
  topics: StudyTopic[];
  onSelectSubject?: (subjectCode: string) => void;
  onExpand?: () => void;
}

export const SyllabusTriadProgressChart: React.FC<SyllabusTriadProgressChartProps> = ({
  subjects,
  topics,
  onSelectSubject,
  onExpand,
}) => {
  const subjectProgress = useMemo(() => {
    return subjects.map((sub) => {
      const subTopics = topics.filter((t) => t.subjectCode === sub.code && !t.deletedAt);
      const total = subTopics.length;

      if (total === 0) {
        return {
          code: sub.code,
          name: sub.name,
          color: sub.color || 'var(--ff-accent)',
          total: 0,
          theoryPct: 0,
          practicePct: 0,
          pyqPct: 0,
          readinessIndex: 0,
        };
      }

      const theoryCount = subTopics.filter((t) => t.theory).length;
      const practiceCount = subTopics.filter((t) => t.practice).length;
      const pyqCount = subTopics.filter((t) => t.pyq).length;

      const theoryPct = Math.round((theoryCount / total) * 100);
      const practicePct = Math.round((practiceCount / total) * 100);
      const pyqPct = Math.round((pyqCount / total) * 100);
      const readinessIndex = Math.round((theoryPct + practicePct + pyqPct) / 3);

      return {
        code: sub.code,
        name: sub.name,
        color: sub.color || 'var(--ff-accent)',
        total,
        theoryPct,
        practicePct,
        pyqPct,
        readinessIndex,
      };
    }).sort((a, b) => b.readinessIndex - a.readinessIndex);
  }, [subjects, topics]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'syllabus_completion_triad',
      ['SubjectCode', 'SubjectName', 'TotalTopics', 'TheoryPct', 'PracticePct', 'PYQPct', 'ReadinessIndex'],
      subjectProgress.map((s) => [s.code, s.name, s.total, s.theoryPct, s.practicePct, s.pyqPct, s.readinessIndex])
    );
  };

  return (
    <GraphCard
      id="syllabus-triad-progress"
      title="Syllabus Triad Completion Progress"
      subtitle="Theory vs Practice vs PYQ curriculum readiness"
      domain="study"
      icon={<CheckCircle2 className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={subjectProgress.length === 0}
      legend={[
        { label: 'Theory', color: 'var(--ff-accent)' },
        { label: 'Practice', color: 'var(--ff-success)' },
        { label: 'PYQ', color: 'var(--ff-warning)' },
      ]}
    >
      <div className="space-y-4 pt-1">
        {subjectProgress.map((item) => (
          <div
            key={item.code}
            onClick={() => onSelectSubject?.(item.code)}
            className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-2 cursor-pointer hover:border-[var(--ff-accent)] transition-all"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-bold text-[var(--ff-text-primary)]">{item.name}</span>
                <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">({item.code})</span>
              </div>
              <span className="font-mono font-bold text-[var(--ff-accent-text)]">
                {item.readinessIndex}% Readiness
              </span>
            </div>

            {/* Triad Progress Track */}
            <div className="space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)]">
                <span>Theory: {item.theoryPct}%</span>
                <span>Practice: {item.practicePct}%</span>
                <span>PYQ: {item.pyqPct}%</span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 h-2 rounded-full overflow-hidden bg-[var(--ff-border-color)]/30">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${item.theoryPct}%`, backgroundColor: 'var(--ff-accent)' }}
                />
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${item.practicePct}%`, backgroundColor: 'var(--ff-success)' }}
                />
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${item.pyqPct}%`, backgroundColor: 'var(--ff-warning)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
