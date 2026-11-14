import React from 'react';
import { StudyActivityLog } from '../../types/study.ts';
import { ThemeCard, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { History, Activity, CheckCircle2 } from 'lucide-react';

interface StudyActivityTabProps {
  activityLogs: StudyActivityLog[];
}

export const StudyActivityTab: React.FC<StudyActivityTabProps> = ({ activityLogs }) => {
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
            <History className="w-5 h-5 text-[var(--ff-accent-text)]" />
            Append-Only Study Activity Audit Trail
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Immutable timeline of study events, revisions completed, quiz attempts, and milestones
          </p>
        </div>

        <ThemeBadge tone="neutral">{activityLogs.length} logged events</ThemeBadge>
      </div>

      {/* Activity Timeline */}
      {activityLogs.length === 0 ? (
        <ThemeCard className="p-12 text-center text-xs text-[var(--ff-text-muted)] space-y-3">
          <Activity className="w-10 h-10 mx-auto text-[var(--ff-text-muted)]/50" />
          <p className="text-sm font-semibold text-[var(--ff-text-primary)]">No activity logs recorded yet.</p>
          <p>Actions like completing spaced reviews, taking quizzes, and ticking goals automatically generate audit entries.</p>
        </ThemeCard>
      ) : (
        <div className="space-y-3">
          {activityLogs.map((log) => {
            const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString() : log.activityDate;
            return (
              <div
                key={log.id}
                className="flex items-start gap-3.5 p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-xs"
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)] flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--ff-text-primary)]">
                        {log.description}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] font-bold">
                        {log.activityType}
                      </span>
                    </div>

                    <span className="text-[11px] text-[var(--ff-text-muted)] font-mono">
                      {dateStr}
                    </span>
                  </div>

                  {log.subjectId && (
                    <span className="text-[10px] text-[var(--ff-text-muted)] capitalize">
                      Subject: {log.subjectId}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
