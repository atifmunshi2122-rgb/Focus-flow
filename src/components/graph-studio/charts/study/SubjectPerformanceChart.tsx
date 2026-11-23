import React, { useMemo } from 'react';
import { StudyExam, StudyRevision, StudySubject } from '../../../../types/study.ts';
import { GraphCard } from '../../core/GraphCard.tsx';
import { Award } from 'lucide-react';
import { exportDatasetToCsv } from '../../core/GraphExport.ts';

export interface SubjectPerformanceChartProps {
  exams: StudyExam[];
  revisions: StudyRevision[];
  subjects: StudySubject[];
  onExpand?: () => void;
}

export const SubjectPerformanceChart: React.FC<SubjectPerformanceChartProps> = ({
  exams,
  revisions,
  subjects,
  onExpand,
}) => {
  const performanceData = useMemo(() => {
    const list: Array<{
      subjectCode: string;
      subjectName: string;
      examAvgPct: number | null;
      revisionRecallAvg: number | null;
      overallScore: number;
    }> = [];

    subjects.forEach((sub) => {
      // Find published exams for this subject
      const subExams = exams.filter(
        (e) =>
          !e.deletedAt &&
          e.resultStatus === 'published' &&
          e.obtainedMarks !== null &&
          e.totalMarks > 0 &&
          (e.subjectIds.includes(sub.id) || e.subjectIds.includes(sub.code))
      );

      const examAvgPct =
        subExams.length > 0
          ? Math.round(
              subExams.reduce((acc, e) => acc + ((e.obtainedMarks || 0) / e.totalMarks) * 100, 0) /
                subExams.length
            )
          : null;

      // Find revisions with recorded recall score
      const subRevisions = revisions.filter(
        (r) =>
          !r.deletedAt &&
          r.subjectCode === sub.code &&
          typeof r.recallScore === 'number' &&
          r.recallScore >= 0
      );

      const revisionRecallAvg =
        subRevisions.length > 0
          ? Math.round(
              subRevisions.reduce((acc, r) => acc + (r.recallScore || 0), 0) / subRevisions.length
            )
          : null;

      // Only include if at least one actual verified score exists
      if (examAvgPct !== null || revisionRecallAvg !== null) {
        const scores = [examAvgPct, revisionRecallAvg].filter((s): s is number => s !== null);
        const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

        list.push({
          subjectCode: sub.code,
          subjectName: sub.name,
          examAvgPct,
          revisionRecallAvg,
          overallScore,
        });
      }
    });

    return list.sort((a, b) => b.overallScore - a.overallScore);
  }, [exams, revisions, subjects]);

  const handleExportCsv = () => {
    exportDatasetToCsv(
      'subject_performance_comparison',
      ['SubjectCode', 'SubjectName', 'ExamAvgPct', 'RevisionRecallAvg', 'OverallScore'],
      performanceData.map((p) => [
        p.subjectCode,
        p.subjectName,
        p.examAvgPct ?? 'N/A',
        p.revisionRecallAvg ?? 'N/A',
        p.overallScore,
      ])
    );
  };

  return (
    <GraphCard
      id="subject-performance-comparison"
      title="Subject Performance Comparison"
      subtitle="Verified exam marks & Ebbinghaus recall scores"
      domain="study"
      icon={<Award className="w-4 h-4" />}
      onExpand={onExpand}
      onExportCsv={handleExportCsv}
      isEmpty={performanceData.length === 0}
      emptyTitle="No verified test or recall marks recorded yet"
      emptyDescription="Log exam results or record Ebbinghaus recall scores during revision reviews to unlock performance comparisons."
      legend={[
        { label: 'Exams %', color: 'var(--ff-accent)' },
        { label: 'Recall %', color: 'var(--ff-success)' },
      ]}
    >
      <div className="space-y-4 pt-1">
        {performanceData.map((item) => (
          <div
            key={item.subjectCode}
            className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[var(--ff-text-primary)]">{item.subjectName}</span>
                <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">
                  ({item.subjectCode})
                </span>
              </div>
              <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                {item.overallScore}% Overall
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-2 rounded-lg bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
                <span className="text-[10px] text-[var(--ff-text-muted)] block">Exams Average</span>
                <span className="font-mono font-bold text-[var(--ff-accent-text)]">
                  {item.examAvgPct !== null ? `${item.examAvgPct}%` : 'No Exams'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
                <span className="text-[10px] text-[var(--ff-text-muted)] block">Spaced Recall Score</span>
                <span className="font-mono font-bold text-[var(--ff-success)]">
                  {item.revisionRecallAvg !== null ? `${item.revisionRecallAvg}%` : 'No Reviews'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GraphCard>
  );
};
