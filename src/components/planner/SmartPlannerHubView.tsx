import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  GraduationCap,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import type { FocusSession, Task } from '../../types/index.ts';
import type { StudyExam, StudyRevision, StudySubject, StudyTopic } from '../../types/study.ts';
import { DEFAULT_TIMEZONE, formatDateInTimezone } from '../../lib/dateTime.ts';
import {
  defaultStudyPlannerSettings,
  sanitizeStudyPlannerSettings,
  type AvailableStudyWindow,
  type PlannedStudySession,
  type ScheduleChangeRecord,
  type StudyPlannerSettings,
  type StudyPriority,
  type StudyTask,
} from '../../features/planner/types.ts';
import { generateStudyPlan } from '../../features/planner/generate-study-plan.ts';
import { suggestReschedule, type RescheduleSuggestion } from '../../features/planner/rescheduling.ts';
import { calculateDaysRemaining, isExamOverdue } from '../../features/planner/exam-types.ts';
import WeeklyStudyPlanner from './WeeklyStudyPlanner.tsx';
import PlannerSettingsPanel from './PlannerSettingsPanel.tsx';

type PlannerSubTab = 'planner' | 'exams' | 'revision' | 'analytics' | 'reminders' | 'settings';

function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export const SmartPlannerHubView: React.FC = () => {
  const { settings, updateSettings, showToast } = useApp();
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;

  const [subTab, setSubTab] = useState<PlannerSubTab>('planner');
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [revisions, setRevisions] = useState<StudyRevision[]>([]);
  const [exams, setExams] = useState<StudyExam[]>([]);
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [topics, setTopics] = useState<StudyTopic[]>([]);

  const [plannerSettings, setPlannerSettings] = useState<StudyPlannerSettings>(() => {
    if (settings?.studyPlannerSettings) {
      return sanitizeStudyPlannerSettings(settings.studyPlannerSettings);
    }
    try {
      const saved = localStorage.getItem('ff_study_planner_settings');
      if (saved) return sanitizeStudyPlannerSettings(JSON.parse(saved));
    } catch {
      // ignore storage errors
    }
    return { ...defaultStudyPlannerSettings };
  });

  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [plannedSessions, setPlannedSessions] = useState<PlannedStudySession[]>([]);
  const [unscheduled, setUnscheduled] = useState<Array<{ taskId: string; reason: string }>>([]);
  const [changeHistory, setChangeHistory] = useState<ScheduleChangeRecord[]>([]);
  const [analyticsRangeDays, setAnalyticsRangeDays] = useState<7 | 30 | 90>(30);
  const [dismissedReminders, setDismissedReminders] = useState<Record<string, boolean>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, sRes, rRes, eRes, subRes, topRes] = await Promise.all([
        api.getTasks().catch(() => []),
        api.getFocusSessions().catch(() => []),
        api.getStudyRevisions().catch(() => []),
        api.getStudyExams().catch(() => []),
        api.getStudySubjects().catch(() => []),
        api.getStudyTopics().catch(() => []),
      ]);
      setTasks(tRes || []);
      setSessions(sRes || []);
      setRevisions(rRes || []);
      setExams(eRes || []);
      setSubjects(subRes || []);
      setTopics(topRes || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const studyTasks: StudyTask[] = useMemo(() => {
    return tasks.map((t) => {
      const priority: StudyPriority =
        t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'medium';
      const deadlineMs = t.dueDate ? Date.parse(`${t.dueDate}T23:59:59`) : undefined;
      return {
        id: t.id,
        title: t.title,
        subjectId: t.subjectCode || t.category,
        priority,
        estimatedMinutes: Math.max(15, (t.estimatedPomodoros || 1) * 25),
        deadline: deadlineMs && Number.isFinite(deadlineMs) ? deadlineMs : undefined,
        completed: t.status === 'completed',
        createdAt: Date.parse(t.createdAt) || Date.now(),
      };
    });
  }, [tasks]);

  const weekWindows: AvailableStudyWindow[] = useMemo(() => {
    return Array.from({ length: 7 }).map((_, idx) => {
      const day = new Date(weekStart.getTime() + idx * 86400000);
      const start = new Date(day);
      start.setHours(plannerSettings.preferredStartHour, 0, 0, 0);
      const end = new Date(day);
      end.setHours(Math.max(plannerSettings.preferredStartHour + 1, plannerSettings.preferredEndHour), 0, 0, 0);
      return { start: start.getTime(), end: end.getTime() };
    });
  }, [weekStart, plannerSettings.preferredStartHour, plannerSettings.preferredEndHour]);

  const runAutoPlan = useCallback(() => {
    const locked = plannedSessions.filter((s) => s.locked);
    const result = generateStudyPlan({
      tasks: studyTasks,
      windows: weekWindows,
      settings: plannerSettings,
      now: Date.now(),
      lockedSessions: locked,
      timezone,
    });
    setPlannedSessions(result.sessions);
    setUnscheduled(result.unscheduled);
    showToast(`Generated ${result.sessions.length} study session(s) for the week`, 'success');
  }, [plannedSessions, studyTasks, weekWindows, plannerSettings, timezone, showToast]);

  useEffect(() => {
    if (!loading && plannerSettings.autoSchedule && plannedSessions.length === 0 && studyTasks.length > 0) {
      const result = generateStudyPlan({
        tasks: studyTasks,
        windows: weekWindows,
        settings: plannerSettings,
        now: Date.now(),
        timezone,
      });
      setPlannedSessions(result.sessions);
      setUnscheduled(result.unscheduled);
    }
  }, [loading, plannerSettings, plannedSessions.length, studyTasks, weekWindows, timezone]);

  const handleUpdateSettings = (next: StudyPlannerSettings) => {
    const clean = sanitizeStudyPlannerSettings(next);
    setPlannerSettings(clean);
    try {
      localStorage.setItem('ff_study_planner_settings', JSON.stringify(clean));
    } catch {
      // ignore storage write errors
    }
    void updateSettings({ studyPlannerSettings: clean }, { silent: true }).catch(() => {});
    showToast('Planner settings saved', 'success');
  };

  const handleToggleLockSession = (sessionId: string) => {
    setPlannedSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, locked: !s.locked } : s))
    );
  };

  const handleMoveSessionNextDay = (sessionId: string) => {
    setPlannedSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId || s.locked) return s;
        const newStart = s.startAt + 86400000;
        const newEnd = s.endAt + 86400000;
        setChangeHistory((h) => [
          {
            id: `chg_${Date.now().toString(36)}`,
            taskId: s.taskId,
            originalStartAt: s.startAt,
            newStartAt: newStart,
            reason: 'Manual +1 day reschedule',
            source: 'manual_edit',
            timestamp: Date.now(),
          },
          ...h.slice(0, 29),
        ]);
        return { ...s, startAt: newStart, endAt: newEnd, generated: false };
      })
    );
    showToast('Session moved +1 day', 'success');
  };

  // Missed session assisted reschedule suggestions
  const rescheduleSuggestions: RescheduleSuggestion[] = useMemo(() => {
    const now = Date.now();
    const taskMap = new Map(studyTasks.map((t) => [t.id, t]));
    const out: RescheduleSuggestion[] = [];
    for (const s of plannedSessions) {
      if (s.endAt >= now || s.locked) continue;
      const task = taskMap.get(s.taskId);
      if (!task || task.completed) continue;
      const sug = suggestReschedule(task, s, weekWindows, plannedSessions, now, true);
      if (sug) out.push(sug);
    }
    return out;
  }, [plannedSessions, studyTasks, weekWindows]);

  const handleAcceptReschedule = (sug: RescheduleSuggestion) => {
    setPlannedSessions((prev) =>
      prev.map((s) =>
        s.taskId === sug.taskId && s.startAt === sug.previousStartAt
          ? { ...s, startAt: sug.suggestedStartAt, endAt: sug.suggestedEndAt, generated: false }
          : s
      )
    );
    setChangeHistory((h) => [
      {
        id: `chg_${Date.now().toString(36)}`,
        taskId: sug.taskId,
        originalStartAt: sug.previousStartAt,
        newStartAt: sug.suggestedStartAt,
        reason: sug.reason,
        source: 'assisted_reschedule',
        timestamp: Date.now(),
      },
      ...h.slice(0, 29),
    ]);
    showToast('Accepted reschedule suggestion', 'success');
  };

  // Analytics calculations (excluding incomplete/cancelled sessions)
  const analyticsData = useMemo(() => {
    const cutoff = Date.now() - analyticsRangeDays * 86400000;
    const validSessions = sessions.filter(
      (s) => s.completed && Date.parse(s.startedAt) >= cutoff
    );
    const totalMinutes = validSessions.reduce((acc, s) => acc + Math.max(0, s.durationMinutes || 0), 0);
    const bySubject = new Map<string, number>();
    for (const s of validSessions) {
      const code = s.subjectCode || 'General';
      bySubject.set(code, (bySubject.get(code) || 0) + (s.durationMinutes || 0));
    }
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const pendingTasks = tasks.filter((t) => t.status !== 'completed').length;
    const masteredTopics = topics.filter((t) => t.theory && t.practice).length;

    return {
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      sessionCount: validSessions.length,
      completedTasks,
      pendingTasks,
      masteredTopics,
      subjectRows: Array.from(bySubject.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    };
  }, [sessions, tasks, topics, analyticsRangeDays]);

  const todayKey = formatDateInTimezone(new Date(), timezone);
  const dueRevisions = useMemo(
    () => revisions.filter((r) => r.status !== 'mastered' && r.nextRevisionAt <= todayKey),
    [revisions, todayKey]
  );

  // Rule-based reminders (never duplicates completed tasks)
  const smartReminders = useMemo(() => {
    const list: Array<{ id: string; title: string; detail: string; kind: string }> = [];
    for (const t of tasks) {
      if (t.status === 'completed' || !t.dueDate) continue;
      if (t.dueDate <= todayKey) {
        list.push({
          id: `rem_task_${t.id}`,
          title: `Task Due: ${t.title}`,
          detail: `Due ${t.dueDate} · Priority ${t.priority}`,
          kind: 'deadline',
        });
      }
    }
    for (const r of dueRevisions.slice(0, 5)) {
      list.push({
        id: `rem_rev_${r.id}`,
        title: `Revision Due: ${r.topicTitle}`,
        detail: `${r.subjectCode} · Scheduled ${r.nextRevisionAt}`,
        kind: 'revision',
      });
    }
    for (const ex of exams) {
      const examMs = Date.parse(ex.examDate);
      if (Number.isFinite(examMs) && !isExamOverdue(examMs, Date.now(), timezone)) {
        const days = calculateDaysRemaining(examMs, Date.now(), timezone);
        if (days <= 14) {
          list.push({
            id: `rem_exam_${ex.id}`,
            title: `Upcoming Exam: ${ex.title}`,
            detail: `${days} day(s) remaining`,
            kind: 'exam',
          });
        }
      }
    }
    return list.filter((item) => !dismissedReminders[item.id]);
  }, [tasks, dueRevisions, exams, todayKey, timezone, dismissedReminders]);

  return (
    <div className="space-y-5">
      {/* Header & Sub-Navigation */}
      <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">
              Smart Study Planner &amp; Automation
            </h2>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            100% deterministic, AI-free rule-based planning, spaced repetition, exam countdowns &amp; analytics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border-color)]">
          {(
            [
              { id: 'planner', label: 'Weekly Planner', icon: CalendarDays },
              { id: 'exams', label: `Exams (${exams.length})`, icon: GraduationCap },
              { id: 'revision', label: `Revision (${dueRevisions.length})`, icon: RefreshCw },
              { id: 'analytics', label: 'Analytics', icon: BarChart3 },
              { id: 'reminders', label: `Reminders (${smartReminders.length})`, icon: Bell },
              { id: 'settings', label: 'Settings', icon: Settings2 },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  active
                    ? 'bg-[var(--ff-accent)] text-white shadow-xs'
                    : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-tab 1: Weekly Planner + Assisted Rescheduling */}
      {subTab === 'planner' && (
        <div className="space-y-4">
          <WeeklyStudyPlanner
            weekStartDate={weekStart}
            onPrevWeek={() => setWeekStart((d) => new Date(d.getTime() - 7 * 86400000))}
            onNextWeek={() => setWeekStart((d) => new Date(d.getTime() + 7 * 86400000))}
            onGeneratePlan={runAutoPlan}
            sessions={plannedSessions}
            tasks={studyTasks}
            unscheduled={unscheduled}
            onToggleLockSession={handleToggleLockSession}
            onMoveSessionNextDay={handleMoveSessionNextDay}
            timezone={timezone}
          />

          {rescheduleSuggestions.length > 0 && (
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-amber-500/30 space-y-2.5">
              <h3 className="text-xs font-bold text-amber-400">
                Assisted Reschedule Suggestions ({rescheduleSuggestions.length})
              </h3>
              {rescheduleSuggestions.map((sug) => {
                const task = studyTasks.find((t) => t.id === sug.taskId);
                return (
                  <div
                    key={`${sug.taskId}-${sug.previousStartAt}`}
                    className="p-3 rounded-xl bg-[var(--ff-surface-muted)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[var(--ff-text-primary)]">
                        {task?.title || sug.taskId}
                      </div>
                      <div className="text-[11px] text-[var(--ff-text-muted)]">
                        Move to {new Date(sug.suggestedStartAt).toLocaleString()} · {sug.reason}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAcceptReschedule(sug)}
                      className="px-3 py-1.5 rounded-xl bg-[var(--ff-accent)] text-white font-semibold shrink-0"
                    >
                      Approve
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {changeHistory.length > 0 && (
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2">
              <h3 className="text-xs font-bold text-[var(--ff-text-primary)]">Schedule Change History</h3>
              {changeHistory.slice(0, 5).map((ch) => (
                <div key={ch.id} className="text-[11px] text-[var(--ff-text-muted)]">
                  • {ch.source}: {new Date(ch.originalStartAt).toLocaleDateString()} →{' '}
                  {new Date(ch.newStartAt).toLocaleDateString()} ({ch.reason})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 2: Exams Countdown */}
      {subTab === 'exams' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {exams.length === 0 ? (
            <div className="col-span-full p-8 rounded-2xl border border-dashed border-[var(--ff-border-color)] text-center text-xs text-[var(--ff-text-muted)]">
              No exams scheduled yet. Add exams in Study OS to track syllabus countdowns here.
            </div>
          ) : (
            exams.map((ex) => {
              const examMs = Date.parse(ex.examDate);
              const overdue = Number.isFinite(examMs) && isExamOverdue(examMs, Date.now(), timezone);
              const daysLeft = Number.isFinite(examMs) ? calculateDaysRemaining(examMs, Date.now(), timezone) : 0;
              const examCodes = Array.isArray(ex.subjectIds) ? ex.subjectIds : [];
              const subTopics = topics.filter((t) => examCodes.includes(t.subjectCode));
              const doneCount = subTopics.filter((t) => t.theory && t.practice).length;
              const pct = subTopics.length > 0 ? Math.round((doneCount / subTopics.length) * 100) : 0;
              return (
                <div
                  key={ex.id}
                  className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[var(--ff-text-primary)]">{ex.title}</span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        overdue
                          ? 'bg-rose-500/15 text-rose-400'
                          : 'bg-indigo-500/15 text-indigo-300'
                      }`}
                    >
                      {overdue ? 'Completed / Past' : `${daysLeft}d left`}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--ff-text-muted)]">
                    {examCodes.join(', ') || 'General'} · {ex.examDate}
                  </div>
                  <div className="h-2 rounded-full bg-[var(--ff-surface-muted)] overflow-hidden">
                    <div className="h-full bg-[var(--ff-accent)]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[11px] text-[var(--ff-text-muted)]">
                    Syllabus: {doneCount}/{subTopics.length} topics ({pct}%)
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Sub-tab 3: Spaced Repetition Revision Dashboard */}
      {subTab === 'revision' && (
        <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-3">
          <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
            Spaced Repetition Queue ({dueRevisions.length} due)
          </h3>
          {dueRevisions.length === 0 ? (
            <div className="text-xs text-[var(--ff-text-muted)] py-6 text-center">
              All caught up! No revisions due today.
            </div>
          ) : (
            <div className="space-y-2.5">
              {dueRevisions.map((rev) => (
                <div
                  key={rev.id}
                  className="p-3 rounded-xl bg-[var(--ff-surface-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-[var(--ff-text-primary)]">
                      {rev.topicTitle}
                    </div>
                    <div className="text-[11px] text-[var(--ff-text-muted)]">
                      {rev.subjectCode} · Due {rev.nextRevisionAt} · Rep #{rev.repetition}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['hard', 'medium', 'easy'] as const).map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={async () => {
                          await api.recordStudyRecall(rev.id, rating);
                          showToast(`Recorded "${rating}" recall for ${rev.topicTitle}`, 'success');
                          void loadAll();
                        }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] hover:border-[var(--ff-accent)] capitalize"
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 4: Deterministic Study Analytics */}
      {subTab === 'analytics' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setAnalyticsRangeDays(days)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                  analyticsRangeDays === days
                    ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)]'
                    : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)]'
                }`}
              >
                Last {days} days
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
              <div className="text-xs text-[var(--ff-text-muted)]">Verified Study Hours</div>
              <div className="text-2xl font-extrabold text-[var(--ff-text-primary)] mt-1">
                {analyticsData.totalHours}h
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
              <div className="text-xs text-[var(--ff-text-muted)]">Focus Sessions</div>
              <div className="text-2xl font-extrabold text-[var(--ff-text-primary)] mt-1">
                {analyticsData.sessionCount}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
              <div className="text-xs text-[var(--ff-text-muted)]">Tasks Completed</div>
              <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                {analyticsData.completedTasks}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
              <div className="text-xs text-[var(--ff-text-muted)]">Topics Mastered</div>
              <div className="text-2xl font-extrabold text-indigo-400 mt-1">
                {analyticsData.masteredTopics}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--ff-text-primary)]">
              Subject-Wise Verified Time Distribution
            </h3>
            {analyticsData.subjectRows.length === 0 ? (
              <div className="text-xs text-[var(--ff-text-muted)]">
                No completed focus sessions in the last {analyticsRangeDays} days.
              </div>
            ) : (
              analyticsData.subjectRows.map(([code, mins]) => {
                const sub = subjects.find((s) => s.code === code);
                return (
                  <div key={code} className="flex items-center justify-between text-xs">
                    <span>{sub?.name || code}</span>
                    <span className="font-mono font-bold">
                      {Math.round((mins / 60) * 10) / 10}h ({mins}m)
                    </span>
                  </div>
                );
              })
            )}
            <p className="text-[10px] text-[var(--ff-text-muted)] pt-2 border-t border-[var(--ff-border-color)]">
              Accuracy note: Cancelled and incomplete focus sessions are excluded. Only verified session durations are counted.
            </p>
          </div>
        </div>
      )}

      {/* Sub-tab 5: Rule-Based Smart Reminders */}
      {subTab === 'reminders' && (
        <div className="p-4 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] space-y-2.5">
          <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
            Rule-Based Study Reminders
          </h3>
          {smartReminders.length === 0 ? (
            <div className="text-xs text-[var(--ff-text-muted)] py-6 text-center">
              No active reminders right now.
            </div>
          ) : (
            smartReminders.map((rem) => (
              <div
                key={rem.id}
                className="p-3 rounded-xl bg-[var(--ff-surface-muted)] flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-[var(--ff-text-primary)]">{rem.title}</div>
                  <div className="text-[11px] text-[var(--ff-text-muted)]">{rem.detail}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedReminders((prev) => ({ ...prev, [rem.id]: true }))}
                  className="px-2.5 py-1 rounded-lg bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] text-[11px]"
                >
                  Dismiss
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Sub-tab 6: Planner Settings */}
      {subTab === 'settings' && (
        <PlannerSettingsPanel value={plannerSettings} onChange={handleUpdateSettings} />
      )}
    </div>
  );
};

export default SmartPlannerHubView;
