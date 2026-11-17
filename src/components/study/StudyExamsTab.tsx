import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { DEFAULT_TIMEZONE } from '../../lib/dateTime.ts';
import { StudyExam, StudySubject, StudyTopic } from '../../types/study.ts';
import { computeStudyExamReadiness } from '../../lib/studyIntelligence.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { Award, Plus, Trash2, Calendar, Clock, BookOpen, AlertCircle } from 'lucide-react';

interface StudyExamsTabProps {
  exams: StudyExam[];
  topics: StudyTopic[];
  subjects: StudySubject[];
  onOpenAddExam: () => void;
  onDeleteExam: (examId: string) => Promise<void>;
}

export const StudyExamsTab: React.FC<StudyExamsTabProps> = ({
  exams,
  topics,
  subjects,
  onOpenAddExam,
  onDeleteExam,
}) => {
  const { settings } = useApp();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const activeExams = exams.filter((e) => !e.deletedAt);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <Award className="w-5 h-5 text-[var(--ff-accent-text)]" />
            Exam Schedules & Readiness Diagnostics
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Monitor exam countdowns, syllabus readiness %, and academic examination scores
          </p>
        </div>

        <ThemeButton variant="primary" size="sm" onClick={onOpenAddExam}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Exam Schedule
        </ThemeButton>
      </div>

      {/* Exams Grid */}
      {activeExams.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <Award className="w-10 h-10 mx-auto text-[var(--ff-text-muted)]/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No upcoming exams scheduled.</p>
          <p>Add your Semester Finals, GATE papers, Class Tests, or Mock Interviews.</p>
          <ThemeButton variant="secondary" size="sm" onClick={onOpenAddExam}>
            Schedule an Exam
          </ThemeButton>
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeExams.map((exam) => {
            const readiness = computeStudyExamReadiness(exam, topics, tz);
            const isUrgent = readiness.daysRemaining <= 3 && readiness.daysRemaining >= 0;
            const isPassed = readiness.daysRemaining < 0;

            return (
              <ThemeCard key={exam.id} className="p-5 flex flex-col justify-between space-y-4">
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
                        {exam.examType}
                      </span>
                      {exam.subjectIds && exam.subjectIds.length > 0 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] font-bold">
                          {exam.subjectIds.join(', ')}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteExam(exam.id)}
                      className="text-[var(--ff-text-muted)] hover:text-rose-400 p-1"
                      title="Delete exam schedule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    {exam.title}
                  </h3>
                  {exam.notes && (
                    <p className="text-xs text-[var(--ff-text-muted)] mt-1 line-clamp-2">
                      {exam.notes}
                    </p>
                  )}

                  {/* Readiness Progress Bar */}
                  <div className="mt-4 p-3 rounded-xl bg-[var(--ff-surface-muted)]/60 border border-[var(--ff-border-color)]/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ff-text-muted)] flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                        Syllabus Readiness
                      </span>
                      <span className="font-bold font-mono text-[var(--ff-text-primary)]">
                        {readiness.readinessPct}%
                      </span>
                    </div>

                    <div className="w-full bg-[var(--ff-surface-muted)] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${readiness.readinessPct}%` }}
                      />
                    </div>

                    <div className="text-[10px] text-[var(--ff-text-muted)] flex justify-between">
                      <span>Covered: {readiness.coveredTopicsCount} topics</span>
                      <span>Total: {readiness.totalSyllabusTopicsCount} in syllabus</span>
                    </div>
                  </div>

                  {/* Marks Obtained if available */}
                  {typeof exam.obtainedMarks === 'number' && (
                    <div className="mt-3 flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-mono font-bold">
                      <span>Score: {exam.obtainedMarks} / {exam.totalMarks || 100}</span>
                      <span>{Math.round(((exam.obtainedMarks) / (exam.totalMarks || 100)) * 100)}%</span>
                    </div>
                  )}
                </div>

                {/* Footer: Date Countdown & Time */}
                <div className="pt-3 border-t border-[var(--ff-border-color)] text-[11px] flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[var(--ff-text-muted)]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{exam.examDate}</span>
                    {exam.startTime && <span>at {exam.startTime}</span>}
                  </div>

                  <span
                    className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                      isPassed
                        ? 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
                        : isUrgent
                        ? 'bg-rose-500/20 text-rose-400 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {isPassed
                      ? 'Completed'
                      : readiness.daysRemaining === 0
                      ? 'TODAY'
                      : `${readiness.daysRemaining} days left`}
                  </span>
                </div>
              </ThemeCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

