import type {
  AuditLogEntry,
  Bill,
  DashboardLayoutConfig,
  DashboardLayoutPreset,
  DashboardWidgetId,
  DashboardWidgetSize,
  FocusSession,
  StudyExam,
  StudyMistake,
  StudyProgressSummary,
  StudyRevision,
  StudySubject,
  StudyTopic,
  Task,
  TimeBlock,
} from '../types/index.ts';
import { addDays, DEFAULT_TIMEZONE, getTodayDateString } from './dateTime.ts';
import {
  categorizeRevisions,
  computeStudyExamReadiness,
  computeStudyProgressSummary,
} from './studyIntelligence.ts';

export const DASHBOARD_DEFAULT_ORDER: DashboardWidgetId[] = [
  'clock_greeting',
  'hero',
  'focus_kpis',
  'todays_priorities',
  'study_pulse',
  'productivity_goals',
  'finance_kpis',
  'upcoming_bills',
  'recent_transactions',
  'gamification',
];

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  clock_greeting: 'Command Header & Live Clock',
  hero: 'Quick Action & Sync Strip',
  focus_kpis: 'Daily Snapshot',
  todays_priorities: "Today's Priorities",
  study_pulse: 'Exam Preparation & Syllabus',
  productivity_goals: 'Focus & Productivity',
  finance_kpis: 'Finance Overview',
  upcoming_bills: 'Upcoming Bills',
  recent_transactions: 'Recent Transactions',
  gamification: 'Activity & Progress',
};

export const DASHBOARD_LAYOUT_PRESETS: Record<
  DashboardLayoutPreset,
  { label: string; description: string; config: DashboardLayoutConfig }
> = {
  executive: {
    label: 'Executive Balanced',
    description: 'Complete personal command center across focus, priorities, exams, and finance.',
    config: {
      preset: 'executive',
      widgetOrder: [...DASHBOARD_DEFAULT_ORDER],
      hiddenWidgets: [],
      widgetSizes: {
        clock_greeting: 'wide',
        hero: 'wide',
        focus_kpis: 'wide',
        todays_priorities: 'compact',
        study_pulse: 'compact',
        productivity_goals: 'wide',
        finance_kpis: 'wide',
        upcoming_bills: 'compact',
        recent_transactions: 'compact',
        gamification: 'wide',
      },
    },
  },
  focus_first: {
    label: 'Focus First',
    description: 'Prioritizes daily snapshot, priorities, exam countdown, focus score, and habits.',
    config: {
      preset: 'focus_first',
      widgetOrder: [
        'clock_greeting',
        'focus_kpis',
        'todays_priorities',
        'study_pulse',
        'productivity_goals',
        'gamification',
        'hero',
        'finance_kpis',
        'upcoming_bills',
        'recent_transactions',
      ],
      hiddenWidgets: ['hero', 'finance_kpis', 'upcoming_bills', 'recent_transactions'],
      widgetSizes: {
        clock_greeting: 'wide',
        focus_kpis: 'wide',
        todays_priorities: 'compact',
        study_pulse: 'compact',
        productivity_goals: 'wide',
        gamification: 'wide',
      },
    },
  },
  finance_pulse: {
    label: 'Finance Pulse',
    description: 'Cashflow, safe-to-spend, bills, and ledger transactions front and center.',
    config: {
      preset: 'finance_pulse',
      widgetOrder: [
        'clock_greeting',
        'finance_kpis',
        'upcoming_bills',
        'recent_transactions',
        'focus_kpis',
        'todays_priorities',
        'hero',
        'study_pulse',
        'productivity_goals',
        'gamification',
      ],
      hiddenWidgets: ['hero', 'study_pulse', 'productivity_goals', 'gamification'],
      widgetSizes: {
        clock_greeting: 'wide',
        finance_kpis: 'wide',
        upcoming_bills: 'compact',
        recent_transactions: 'compact',
        focus_kpis: 'wide',
        todays_priorities: 'wide',
      },
    },
  },
  minimal: {
    label: 'Minimal Brief',
    description: 'Essential command header, daily snapshot, today priorities, and finance summary.',
    config: {
      preset: 'minimal',
      widgetOrder: [
        'clock_greeting',
        'focus_kpis',
        'todays_priorities',
        'finance_kpis',
        'hero',
        'study_pulse',
        'productivity_goals',
        'upcoming_bills',
        'recent_transactions',
        'gamification',
      ],
      hiddenWidgets: [
        'hero',
        'study_pulse',
        'productivity_goals',
        'upcoming_bills',
        'recent_transactions',
        'gamification',
      ],
      widgetSizes: {
        clock_greeting: 'wide',
        focus_kpis: 'wide',
        todays_priorities: 'wide',
        finance_kpis: 'wide',
      },
    },
  },
};

const COMPACT_BY_DEFAULT = new Set<DashboardWidgetId>([
  'todays_priorities',
  'study_pulse',
  'upcoming_bills',
  'recent_transactions',
]);

/**
 * Safely normalizes any saved user DashboardLayoutConfig (including pre-2.0 configs
 * that did not yet include `todays_priorities`) while preserving existing user order
 * and visibility preferences.
 */
export function normalizeDashboardLayout(
  saved?: DashboardLayoutConfig | null
): DashboardLayoutConfig {
  if (!saved) {
    return {
      ...DASHBOARD_LAYOUT_PRESETS.executive.config,
      widgetOrder: [...DASHBOARD_LAYOUT_PRESETS.executive.config.widgetOrder],
      hiddenWidgets: [...DASHBOARD_LAYOUT_PRESETS.executive.config.hiddenWidgets],
      widgetSizes: { ...DASHBOARD_LAYOUT_PRESETS.executive.config.widgetSizes },
    };
  }

  const validSet = new Set<DashboardWidgetId>(DASHBOARD_DEFAULT_ORDER);
  const ordered = (saved.widgetOrder || []).filter((id): id is DashboardWidgetId => validSet.has(id));
  const seen = new Set<DashboardWidgetId>(ordered);

  for (const id of DASHBOARD_DEFAULT_ORDER) {
    if (!seen.has(id)) {
      if (id === 'todays_priorities') {
        const studyIdx = ordered.indexOf('study_pulse');
        if (studyIdx >= 0) {
          ordered.splice(studyIdx, 0, id);
        } else {
          const focusIdx = ordered.indexOf('focus_kpis');
          ordered.splice(focusIdx >= 0 ? focusIdx + 1 : ordered.length, 0, id);
        }
      } else {
        ordered.push(id);
      }
      seen.add(id);
    }
  }

  const preset: DashboardLayoutPreset =
    saved.preset && saved.preset in DASHBOARD_LAYOUT_PRESETS ? saved.preset : 'executive';

  return {
    preset,
    widgetOrder: ordered,
    hiddenWidgets: (saved.hiddenWidgets || []).filter((id): id is DashboardWidgetId =>
      validSet.has(id)
    ),
    widgetSizes: { ...(saved.widgetSizes || {}) },
  };
}

/**
 * Resolves the intended base desktop span (6 or 12 columns) for a widget.
 */
export function resolveBaseWidgetCols(
  id: DashboardWidgetId,
  widgetSizes: Partial<Record<DashboardWidgetId, DashboardWidgetSize>>
): 6 | 12 {
  const explicit = widgetSizes[id];
  if (explicit === 'wide') return 12;
  if (explicit === 'compact') return 6;
  if (explicit === 'standard') {
    return COMPACT_BY_DEFAULT.has(id) ? 6 : 12;
  }
  return COMPACT_BY_DEFAULT.has(id) ? 6 : 12;
}

/**
 * Computes balanced 12-column desktop spans for all visible widgets,
 * automatically promoting any lone 6-column widget to 12 columns so no
 * desktop row ever has an awkward half-empty gap.
 */
export function computeDashboardGridSpans(
  visibleIds: DashboardWidgetId[],
  widgetSizes: Partial<Record<DashboardWidgetId, DashboardWidgetSize>>
): Record<string, 'lg:col-span-6' | 'lg:col-span-12'> {
  const result: Record<string, 'lg:col-span-6' | 'lg:col-span-12'> = {};
  const baseSpans = visibleIds.map((id) => resolveBaseWidgetCols(id, widgetSizes));

  let colUsed = 0;
  for (let i = 0; i < visibleIds.length; i++) {
    const id = visibleIds[i];
    const base = baseSpans[i];

    if (base === 12) {
      result[id] = 'lg:col-span-12';
      colUsed = 0;
      continue;
    }

    // base === 6
    if (colUsed === 0) {
      const nextBase = i + 1 < visibleIds.length ? baseSpans[i + 1] : null;
      if (nextBase === 6) {
        result[id] = 'lg:col-span-6';
        colUsed = 6;
      } else {
        // Lone 6-col widget followed by a 12-col widget or end of list -> promote to 12
        result[id] = 'lg:col-span-12';
        colUsed = 0;
      }
    } else {
      // Completing a 6 + 6 pair
      result[id] = 'lg:col-span-6';
      colUsed = 0;
    }
  }

  return result;
}

/**
 * Formats a minute-of-day (0–1440) into a concise 12-hour clock label (e.g. "9:30 AM").
 */
export function formatMinuteOfDay(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minute)));
  const hrs24 = Math.floor(clamped / 60) % 24;
  const mins = clamped % 60;
  const suffix = hrs24 >= 12 ? 'PM' : 'AM';
  const hrs12 = hrs24 % 12 === 0 ? 12 : hrs24 % 12;
  return `${hrs12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

export interface UpcomingCalendarItem {
  id: string;
  title: string;
  date: string;
  kind: 'bill' | 'exam' | 'revision' | 'task';
  meta?: string;
  targetTab: 'bills' | 'study' | 'tasks' | 'calendar';
}

export interface OverduePriorityItem {
  id: string;
  title: string;
  dueDate: string;
  kind: 'task' | 'bill' | 'revision';
  targetTab: 'tasks' | 'bills' | 'study';
}

export interface TodaysPrioritiesSnapshot {
  pendingTasks: Task[];
  totalPendingTasks: number;
  todayTimeBlocks: TimeBlock[];
  upcomingEvents: UpcomingCalendarItem[];
  overdueItems: OverduePriorityItem[];
}

const PRIORITY_RANK: Record<Task['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Aggregates Today's Priorities from existing Tasks, TimeBlocks, Bills, Exams, and Revisions.
 */
export function buildTodaysPriorities(input: {
  tasks: Task[];
  timeBlocks: TimeBlock[];
  bills: Bill[];
  exams: StudyExam[];
  revisions: StudyRevision[];
  todayStr: string;
}): TodaysPrioritiesSnapshot {
  const { tasks, timeBlocks, bills, exams, revisions, todayStr } = input;
  const horizonEnd = addDays(todayStr, 7);

  const activePendingTasks = tasks.filter(
    (t) => !t.deletedAt && t.status !== 'completed'
  );

  // Sort: overdue first -> due today -> priority -> earliest dueDate
  const sortedPending = [...activePendingTasks].sort((a, b) => {
    const aDue = a.dueDate ? a.dueDate.slice(0, 10) : '';
    const bDue = b.dueDate ? b.dueDate.slice(0, 10) : '';
    const aOverdue = aDue !== '' && aDue < todayStr ? 0 : 1;
    const bOverdue = bDue !== '' && bDue < todayStr ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    const aToday = aDue === todayStr ? 0 : 1;
    const bToday = bDue === todayStr ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;

    const pDiff = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    if (pDiff !== 0) return pDiff;

    if (aDue && bDue) return aDue.localeCompare(bDue);
    if (aDue) return -1;
    if (bDue) return 1;
    return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
  });

  const todayTimeBlocks = timeBlocks
    .filter((tb) => !tb.deletedAt && tb.date === todayStr)
    .sort((a, b) => a.startMinute - b.startMinute);

  const overdueItems: OverduePriorityItem[] = [];

  for (const task of activePendingTasks) {
    const due = task.dueDate ? task.dueDate.slice(0, 10) : '';
    if (due && due < todayStr) {
      overdueItems.push({
        id: `task:${task.id}`,
        title: task.title,
        dueDate: due,
        kind: 'task',
        targetTab: 'tasks',
      });
    }
  }

  for (const bill of bills) {
    if (bill.deletedAt || bill.status === 'PAID') continue;
    const due = bill.dueDate.slice(0, 10);
    if (due < todayStr || bill.status === 'OVERDUE') {
      overdueItems.push({
        id: `bill:${bill.id}`,
        title: bill.name,
        dueDate: due,
        kind: 'bill',
        targetTab: 'bills',
      });
    }
  }

  const { overdue: overdueRevs, dueToday: dueRevs, upcoming: upcomingRevs } = categorizeRevisions(
    revisions,
    todayStr
  );

  for (const rev of overdueRevs) {
    overdueItems.push({
      id: `rev:${rev.id}`,
      title: `${rev.subjectCode}: ${rev.topicTitle}`,
      dueDate: rev.nextRevisionAt.slice(0, 10),
      kind: 'revision',
      targetTab: 'study',
    });
  }

  overdueItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Upcoming calendar events within [todayStr, todayStr + 7 days]
  const upcomingEvents: UpcomingCalendarItem[] = [];

  for (const exam of exams) {
    if (exam.deletedAt || exam.preparationStatus === 'completed') continue;
    const date = exam.examDate.slice(0, 10);
    if (date >= todayStr && date <= horizonEnd) {
      upcomingEvents.push({
        id: `exam:${exam.id}`,
        title: exam.title,
        date,
        kind: 'exam',
        meta: exam.examType,
        targetTab: 'study',
      });
    }
  }

  for (const bill of bills) {
    if (bill.deletedAt || bill.status === 'PAID') continue;
    const date = bill.dueDate.slice(0, 10);
    if (date >= todayStr && date <= horizonEnd) {
      upcomingEvents.push({
        id: `bill:${bill.id}`,
        title: bill.name,
        date,
        kind: 'bill',
        meta: bill.categoryName || 'Bill',
        targetTab: 'bills',
      });
    }
  }

  for (const rev of [...dueRevs, ...upcomingRevs]) {
    const date = rev.nextRevisionAt.slice(0, 10);
    if (date > todayStr && date <= horizonEnd) {
      upcomingEvents.push({
        id: `rev:${rev.id}`,
        title: `${rev.subjectCode} • ${rev.topicTitle}`,
        date,
        kind: 'revision',
        meta: 'Revision',
        targetTab: 'study',
      });
    }
  }

  for (const task of activePendingTasks) {
    const date = task.dueDate ? task.dueDate.slice(0, 10) : '';
    if (date && date > todayStr && date <= horizonEnd) {
      upcomingEvents.push({
        id: `task:${task.id}`,
        title: task.title,
        date,
        kind: 'task',
        meta: task.priority,
        targetTab: 'tasks',
      });
    }
  }

  upcomingEvents.sort((a, b) => a.date.localeCompare(b.date));

  return {
    pendingTasks: sortedPending.slice(0, 5),
    totalPendingTasks: activePendingTasks.length,
    todayTimeBlocks,
    upcomingEvents: upcomingEvents.slice(0, 5),
    overdueItems,
  };
}

export interface NextExamSummary {
  exam: StudyExam;
  daysRemaining: number;
  readinessPct: number;
  coveredTopicsCount: number;
  totalSyllabusTopicsCount: number;
}

export interface ExamPrepSnapshot {
  nextExam: NextExamSummary | null;
  upcomingExamsCount: number;
  summary: StudyProgressSummary;
  topSubjects: StudyProgressSummary['subjectBreakdown'];
  revisionCompletionPct: number;
  totalActiveRevisions: number;
}

/**
 * Builds the Exam Preparation & Syllabus snapshot using existing studyIntelligence calculators.
 */
export function buildExamPrepSnapshot(input: {
  exams: StudyExam[];
  subjects: StudySubject[];
  topics: StudyTopic[];
  revisions: StudyRevision[];
  mistakes: StudyMistake[];
  focusSessions?: FocusSession[];
  todayStr?: string;
  timezone?: string;
}): ExamPrepSnapshot {
  const tz = input.timezone || DEFAULT_TIMEZONE;
  const todayStr = input.todayStr || getTodayDateString(tz);

  const summary = computeStudyProgressSummary({
    subjects: input.subjects,
    topics: input.topics,
    revisions: input.revisions,
    mistakes: input.mistakes,
    focusSessions: input.focusSessions,
    todayStr,
    timezone: tz,
  });

  const upcomingExams = input.exams
    .filter(
      (e) =>
        !e.deletedAt &&
        e.preparationStatus !== 'completed' &&
        e.examDate &&
        e.examDate.slice(0, 10) >= todayStr
    )
    .sort((a, b) => a.examDate.localeCompare(b.examDate));

  let nextExam: NextExamSummary | null = null;
  if (upcomingExams.length > 0) {
    const candidate = upcomingExams[0];
    const readiness = computeStudyExamReadiness(candidate, input.topics, todayStr);
    nextExam = {
      exam: candidate,
      daysRemaining: readiness.daysRemaining,
      readinessPct: readiness.readinessPct,
      coveredTopicsCount: readiness.coveredTopicsCount,
      totalSyllabusTopicsCount: readiness.totalSyllabusTopicsCount,
    };
  }

  const topSubjects = [...summary.subjectBreakdown]
    .filter((s) => s.total > 0 || (s.studyMinutes || 0) > 0)
    .sort((a, b) => b.total - a.total || b.completionPct - a.completionPct)
    .slice(0, 4);

  const activeRevisions = input.revisions.filter((r) => !r.deletedAt);
  const totalActiveRevisions = activeRevisions.length;
  const revisionCompletionPct =
    totalActiveRevisions > 0
      ? Math.min(100, Math.round((summary.masteredRevisionsCount / totalActiveRevisions) * 100))
      : 0;

  return {
    nextExam,
    upcomingExamsCount: upcomingExams.length,
    summary,
    topSubjects,
    revisionCompletionPct,
    totalActiveRevisions,
  };
}

export interface ActivityFeedItem {
  id: string;
  title: string;
  subtitle: string;
  timestamp: string;
  kind: 'focus' | 'task' | 'finance' | 'habit' | 'system';
}

const ACTION_VERBS: Record<AuditLogEntry['action'], string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  restore: 'Restored',
  pay: 'Paid',
  undo_payment: 'Reverted payment',
  import_backup: 'Imported backup',
  purge: 'Purged',
  envelope_transfer: 'Transferred envelope',
  backup_restore: 'Restored backup',
};

const ENTITY_LABELS: Record<AuditLogEntry['entityType'], string> = {
  task: 'Task',
  income: 'Income',
  expense: 'Expense',
  bill: 'Bill',
  time_block: 'Time Block',
  envelope: 'Budget Envelope',
  subscription: 'Subscription',
  habit: 'Habit',
  settings: 'Settings',
  backup: 'Backup',
};

/**
 * Produces a concise, real recent activity feed from AuditLogEntry records,
 * enriched with completed focus sessions when audit logs are sparse.
 */
export function buildRecentActivityFeed(input: {
  auditLogs: AuditLogEntry[];
  focusSessions: FocusSession[];
  tasks: Task[];
  limit?: number;
}): ActivityFeedItem[] {
  const limit = input.limit ?? 6;
  const items: ActivityFeedItem[] = [];

  for (const log of input.auditLogs || []) {
    const verb = ACTION_VERBS[log.action] || 'Updated';
    const entity = ENTITY_LABELS[log.entityType] || 'Item';
    const title = log.entityTitle ? `${verb} ${log.entityTitle}` : `${verb} ${entity}`;
    const kind: ActivityFeedItem['kind'] =
      log.entityType === 'income' ||
      log.entityType === 'expense' ||
      log.entityType === 'bill' ||
      log.entityType === 'envelope' ||
      log.entityType === 'subscription'
        ? 'finance'
        : log.entityType === 'habit'
        ? 'habit'
        : log.entityType === 'task' || log.entityType === 'time_block'
        ? 'task'
        : 'system';

    items.push({
      id: `audit:${log.id}`,
      title,
      subtitle: log.details || entity,
      timestamp: log.timestamp,
      kind,
    });
  }

  // Add completed work focus sessions (audit logs do not always log focus sessions)
  const completedSessions = (input.focusSessions || [])
    .filter((s) => s.completed && s.mode === 'work')
    .sort((a, b) => (b.endedAt || b.startedAt).localeCompare(a.endedAt || a.startedAt))
    .slice(0, 4);

  for (const sess of completedSessions) {
    const mins = Math.max(
      1,
      Math.round(
        (typeof sess.actualDurationSeconds === 'number'
          ? sess.actualDurationSeconds
          : sess.durationMinutes * 60) / 60
      )
    );
    items.push({
      id: `focus:${sess.id}`,
      title: `Completed ${mins}m Focus`,
      subtitle: sess.taskTitle || 'Deep Focus Session',
      timestamp: sess.endedAt || sess.startedAt,
      kind: 'focus',
    });
  }

  // If still sparse, include recently completed tasks
  if (items.length < limit) {
    const doneTasks = (input.tasks || [])
      .filter((t) => !t.deletedAt && t.status === 'completed')
      .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
      .slice(0, 4);

    for (const task of doneTasks) {
      const alreadyLogged = items.some(
        (it) => it.title.includes(task.title) && it.kind === 'task'
      );
      if (!alreadyLogged) {
        items.push({
          id: `task-done:${task.id}`,
          title: `Completed ${task.title}`,
          subtitle: `${task.priority} priority task`,
          timestamp: task.updatedAt || task.createdAt,
          kind: 'task',
        });
      }
    }
  }

  return items
    .filter((it) => Boolean(it.timestamp))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}
