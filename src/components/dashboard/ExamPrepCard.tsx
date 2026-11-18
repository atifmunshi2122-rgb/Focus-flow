import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  GraduationCap,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { ExamPrepSnapshot } from '../../lib/dashboardIntelligence.ts';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import { AnimatedProgressBar } from '../ui/MotionPrimitives.tsx';

interface ExamPrepCardProps {
  snapshot: ExamPrepSnapshot;
  onOpenStudyOS: () => void;
  isWide?: boolean;
}

const formatExamDate = (isoDate: string): string => {
  const clean = isoDate.slice(0, 10);
  const parsed = new Date(`${clean}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return clean;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

export const ExamPrepCard: React.FC<ExamPrepCardProps> = ({
  snapshot,
  onOpenStudyOS,
  isWide = false,
}) => {
  const {
    nextExam,
    upcomingExamsCount,
    summary,
    topSubjects,
    revisionCompletionPct,
    totalActiveRevisions,
  } = snapshot;

  const dueOrOverdueRevs = summary.dueRevisionsCount + summary.overdueRevisionsCount;

  return (
    <ThemeCard className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--ff-border-color)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              background: 'var(--ff-accent-soft)',
              borderColor: 'var(--ff-accent-border)',
              color: 'var(--ff-accent-text)',
            }}
          >
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                Exam Preparation
              </h3>
              <ThemeBadge tone="accent">{summary.overallCompletionPct}% syllabus</ThemeBadge>
            </div>
            <p className="text-[11px] text-[var(--ff-text-muted)] whitespace-normal break-words leading-snug mt-0.5">
              Countdown, subject coverage &amp; spaced-repetition mastery
            </p>
          </div>
        </div>

        <ThemeButton
          variant="secondary"
          size="sm"
          onClick={onOpenStudyOS}
          className="text-xs px-2.5 py-1 shrink-0"
        >
          Study OS
          <ArrowUpRight className="w-3.5 h-3.5" />
        </ThemeButton>
      </div>

      {/* Content */}
      <div className={`grid grid-cols-1 ${isWide ? 'lg:grid-cols-12' : ''} gap-4 flex-1`}>
        {/* Left/Top: Next Exam Countdown + Revision Metrics */}
        <div className={`${isWide ? 'lg:col-span-6' : ''} flex flex-col gap-3 min-w-0`}>
          {nextExam ? (
            <div
              className="p-3.5 border flex flex-col gap-2.5"
              style={{
                borderRadius: 'var(--ff-radius-button)',
                background: 'var(--ff-surface-subtle)',
                borderColor: 'var(--ff-accent-border)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-accent-text)]">
                      Next Upcoming Exam
                    </span>
                    <ThemeBadge tone="neutral">{nextExam.exam.examType}</ThemeBadge>
                  </div>
                  <h4
                    title={nextExam.exam.title}
                    className="text-sm font-bold text-[var(--ff-text-primary)] whitespace-normal break-words leading-snug"
                  >
                    {nextExam.exam.title}
                  </h4>
                  <p className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-1.5 mt-0.5">
                    <CalendarClock className="w-3 h-3 shrink-0" />
                    <span>{formatExamDate(nextExam.exam.examDate)}</span>
                    {upcomingExamsCount > 1 && (
                      <span>· +{upcomingExamsCount - 1} more scheduled</span>
                    )}
                  </p>
                </div>

                {/* Countdown Pill */}
                <div
                  className="px-2.5 py-1.5 text-center shrink-0 border"
                  style={{
                    borderRadius: 'var(--ff-radius-button)',
                    background: 'var(--ff-accent-soft)',
                    borderColor: 'var(--ff-accent-border)',
                  }}
                >
                  <div className="text-lg font-black font-mono leading-none text-[var(--ff-accent-text)]">
                    {nextExam.daysRemaining === 0
                      ? 'TODAY'
                      : `D-${nextExam.daysRemaining}`}
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] mt-0.5">
                    {nextExam.daysRemaining === 1 ? '1 day left' : nextExam.daysRemaining === 0 ? 'Exam day' : 'days left'}
                  </div>
                </div>
              </div>

              {nextExam.totalSyllabusTopicsCount > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--ff-text-muted)]">Exam syllabus readiness</span>
                    <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                      {nextExam.coveredTopicsCount}/{nextExam.totalSyllabusTopicsCount} topics ({nextExam.readinessPct}%)
                    </span>
                  </div>
                  <AnimatedProgressBar
                    value={nextExam.readinessPct}
                    max={100}
                    heightClass="h-1.5"
                    tone={nextExam.readinessPct >= 75 ? 'success' : 'accent'}
                    ariaLabel="Exam syllabus readiness"
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              className="px-3.5 py-3 border border-dashed border-[var(--ff-border-color)] flex flex-wrap items-center justify-between gap-3"
              style={{
                borderRadius: 'var(--ff-radius-button)',
                background: 'var(--ff-surface-subtle)',
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--ff-text-primary)] leading-snug">
                  No upcoming exam scheduled
                </p>
                <p className="text-[11px] text-[var(--ff-text-muted)] whitespace-normal break-words leading-relaxed mt-0.5">
                  Add an exam target in Study OS to track countdown &amp; readiness.
                </p>
              </div>
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={onOpenStudyOS}
                className="text-xs px-2.5 py-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Exam
              </ThemeButton>
            </div>
          )}

          {/* Revision & Mastery Row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="ff-surface-subtle px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                <BookOpen className="w-3 h-3" /> Topics
              </div>
              <p className="text-sm font-black font-mono text-[var(--ff-text-primary)] mt-0.5">
                {summary.completedTopics}
                <span className="text-[11px] font-normal text-[var(--ff-text-muted)]">
                  /{summary.totalTopics}
                </span>
              </p>
            </div>

            <div className="ff-surface-subtle px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                <RotateCcw className="w-3 h-3" /> Revisions
              </div>
              <p
                className="text-sm font-black font-mono mt-0.5"
                style={{
                  color:
                    summary.overdueRevisionsCount > 0
                      ? 'var(--ff-danger)'
                      : dueOrOverdueRevs > 0
                      ? 'var(--ff-warning)'
                      : 'var(--ff-success)',
                }}
              >
                {totalActiveRevisions > 0 ? `${revisionCompletionPct}%` : '—'}
              </p>
              <p className="text-[10px] text-[var(--ff-text-muted)] truncate">
                {dueOrOverdueRevs > 0
                  ? `${dueOrOverdueRevs} due`
                  : `${summary.masteredRevisionsCount} mastered`}
              </p>
            </div>

            <div className="ff-surface-subtle px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                <AlertTriangle className="w-3 h-3" /> Traps
              </div>
              <p
                className="text-sm font-black font-mono mt-0.5"
                style={{
                  color:
                    summary.highSeverityMistakesCount > 0
                      ? 'var(--ff-danger)'
                      : 'var(--ff-text-primary)',
                }}
              >
                {summary.unresolvedMistakesCount}
              </p>
              <p className="text-[10px] text-[var(--ff-text-muted)] truncate">
                {summary.highSeverityMistakesCount > 0
                  ? `${summary.highSeverityMistakesCount} high`
                  : 'unresolved'}
              </p>
            </div>
          </div>
        </div>

        {/* Right/Bottom: Subject-wise Syllabus Progress */}
        <div className={`${isWide ? 'lg:col-span-6' : ''} flex flex-col gap-2 min-w-0`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
              Subject-wise Syllabus Progress
            </span>
            <span className="text-[10px] font-mono text-[var(--ff-text-muted)]">
              {topSubjects.length > 0 ? `${summary.completedTopics}/${summary.totalTopics} done` : 'No subjects'}
            </span>
          </div>

          {topSubjects.length === 0 ? (
            <div className="ff-surface-subtle px-3 py-2.5 flex items-center justify-between gap-2 text-xs text-[var(--ff-text-muted)]">
              <span>No syllabus subjects added yet.</span>
              <button
                type="button"
                onClick={onOpenStudyOS}
                className="text-[11px] font-bold text-[var(--ff-accent-text)] hover:underline shrink-0"
              >
                Configure in Study OS
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topSubjects.map((sub) => (
                <div key={sub.code} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color || 'var(--ff-accent)' }}
                      />
                      <span className="font-semibold text-[var(--ff-text-primary)] truncate">
                        {sub.name}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--ff-text-muted)] shrink-0">
                        {sub.code}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-[var(--ff-text-secondary)] shrink-0">
                      {sub.completed}/{sub.total} ({sub.completionPct}%)
                    </span>
                  </div>
                  <AnimatedProgressBar
                    value={sub.completionPct}
                    max={100}
                    heightClass="h-1.5"
                    tone={sub.completionPct >= 80 ? 'success' : 'accent'}
                    ariaLabel={`${sub.name} syllabus progress`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ThemeCard>
  );
};

