import {
  RevisionDifficulty,
  StudyMistake,
  StudyProgressSummary,
  StudyRevision,
  StudySubject,
  StudyTopic,
} from '../types/study.ts';
import { FocusSession } from '../types/index.ts';
import { DEFAULT_TIMEZONE, getTodayDateString, addDays } from './dateTime.ts';

export const REVISION_INTERVAL_LADDER = [1, 3, 7, 14, 30, 60] as const;

/**
 * Calculates next revision date string (YYYY-MM-DD) given base date and interval in days.
 * If only intervalDays is provided, calculates from today in the configured timezone.
 */
export function calculateNextRevisionDate(
  baseDateStrOrDays: string | number,
  maybeIntervalDays?: number,
  timezone: string = DEFAULT_TIMEZONE
): string {
  let baseDateStr: string;
  let intervalDays: number;

  if (typeof baseDateStrOrDays === 'number') {
    intervalDays = baseDateStrOrDays;
    baseDateStr = getTodayDateString(timezone);
  } else {
    baseDateStr = baseDateStrOrDays;
    intervalDays = maybeIntervalDays ?? 1;
  }

  return addDays(baseDateStr.slice(0, 10), intervalDays);
}

/**
 * Applies Ebbinghaus spaced repetition recall feedback to update revision item state.
 */
export function processRevisionRecall(
  revision: StudyRevision,
  difficulty: RevisionDifficulty,
  reviewDateStr?: string,
  timezone: string = DEFAULT_TIMEZONE
): StudyRevision {
  const todayStr = reviewDateStr || getTodayDateString(timezone);
  const ladder = REVISION_INTERVAL_LADDER;
  const currentIdx = ladder.indexOf(revision.intervalDays as 1 | 3 | 7 | 14 | 30 | 60);

  let nextIntervalDays: number;
  let nextRepetition = revision.repetition + 1;
  let nextStatus: StudyRevision['status'] = 'scheduled';

  if (difficulty === 'hard') {
    // Drop back one interval step (minimum 1 day)
    const newIdx = Math.max(0, (currentIdx >= 0 ? currentIdx : 0) - 1);
    nextIntervalDays = ladder[newIdx];
  } else if (difficulty === 'easy') {
    // Jump two steps if possible, or mark mastered
    const newIdx = Math.min(ladder.length - 1, (currentIdx >= 0 ? currentIdx : 0) + 2);
    nextIntervalDays = ladder[newIdx];
    if (newIdx >= ladder.length - 1) {
      nextStatus = 'mastered';
    }
  } else {
    // Medium: advance 1 step
    const newIdx = (currentIdx >= 0 ? currentIdx : 0) + 1;
    if (newIdx >= ladder.length - 1) {
      nextIntervalDays = ladder[ladder.length - 1];
      nextStatus = 'mastered';
    } else {
      nextIntervalDays = ladder[newIdx];
    }
  }

  const nextRevisionAt = calculateNextRevisionDate(todayStr, nextIntervalDays, timezone);

  return {
    ...revision,
    lastStudiedAt: todayStr,
    nextRevisionAt,
    intervalDays: nextIntervalDays,
    repetition: nextRepetition,
    difficulty,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Categorizes active revisions into due today, overdue, upcoming, and mastered groups.
 * Respects configured user timezone or explicitly passed reference date.
 */
export function categorizeRevisions(
  revisions: StudyRevision[],
  todayStrOrTimezone?: string,
  timezone: string = DEFAULT_TIMEZONE
): {
  dueToday: StudyRevision[];
  overdue: StudyRevision[];
  upcoming: StudyRevision[];
  mastered: StudyRevision[];
} {
  const todayStr =
    todayStrOrTimezone && /^\d{4}-\d{2}-\d{2}$/.test(todayStrOrTimezone)
      ? todayStrOrTimezone
      : getTodayDateString(todayStrOrTimezone || timezone || DEFAULT_TIMEZONE);

  const dueToday: StudyRevision[] = [];
  const overdue: StudyRevision[] = [];
  const upcoming: StudyRevision[] = [];
  const mastered: StudyRevision[] = [];

  for (const rev of revisions) {
    if (rev.deletedAt) continue;
    if (rev.status === 'mastered') {
      mastered.push(rev);
    } else if (rev.nextRevisionAt < todayStr) {
      overdue.push({ ...rev, status: 'overdue' });
    } else if (rev.nextRevisionAt === todayStr) {
      dueToday.push({ ...rev, status: 'due' });
    } else {
      upcoming.push({ ...rev, status: 'scheduled' });
    }
  }

  // Sort due and overdue by oldest nextRevisionAt first
  overdue.sort((a, b) => a.nextRevisionAt.localeCompare(b.nextRevisionAt));
  dueToday.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
  upcoming.sort((a, b) => a.nextRevisionAt.localeCompare(b.nextRevisionAt));

  return { dueToday, overdue, upcoming, mastered };
}

/**
 * Computes deterministic Study Progress Summary from live stored entities.
 */
export function computeStudyProgressSummary(input: {
  subjects: StudySubject[];
  topics: StudyTopic[];
  revisions: StudyRevision[];
  mistakes: StudyMistake[];
  focusSessions?: FocusSession[];
  todayStr?: string;
  timezone?: string;
}): StudyProgressSummary {
  const tz = input.timezone || DEFAULT_TIMEZONE;
  const todayStr = input.todayStr || getTodayDateString(tz);
  const activeSubjects = input.subjects.filter((s) => !s.deletedAt);
  const activeTopics = input.topics.filter((t) => !t.deletedAt);
  const activeMistakes = input.mistakes.filter((m) => !m.deletedAt);

  const totalTopics = activeTopics.length;
  let completedTopics = 0;
  let theoryCompleted = 0;
  let practiceCompleted = 0;
  let pyqCompleted = 0;

  for (const t of activeTopics) {
    if (t.theory) theoryCompleted++;
    if (t.practice) practiceCompleted++;
    if (t.pyq) pyqCompleted++;
    // Topic is considered completed if both theory and practice are checked
    if (t.theory && t.practice) {
      completedTopics++;
    }
  }

  const overallCompletionPct =
    totalTopics > 0 ? Math.min(100, Math.round((completedTopics / totalTopics) * 100)) : 0;

  // Revisions categorization
  const { dueToday, overdue, mastered } = categorizeRevisions(input.revisions, todayStr, tz);

  // Mistakes metrics
  const totalMistakesCount = activeMistakes.length;
  const unresolvedMistakesCount = activeMistakes.filter((m) => !m.resolved).length;
  const highSeverityMistakesCount = activeMistakes.filter(
    (m) => !m.resolved && m.severity === 'High'
  ).length;

  const getSessionActualMins = (fs: FocusSession): number => {
    const effectiveSecs =
      typeof fs.actualDurationSeconds === 'number' && !Number.isNaN(fs.actualDurationSeconds)
        ? fs.actualDurationSeconds
        : typeof fs.durationSeconds === 'number' && !Number.isNaN(fs.durationSeconds)
        ? fs.durationSeconds
        : typeof fs.durationMinutes === 'number'
        ? fs.durationMinutes * 60
        : 0;
    return Math.round(effectiveSecs / 60);
  };

  // Study focus minutes from completed work focus sessions (reflecting actual completed time)
  const studyFocusKeywords = ['study', 'dsa', 'exam', 'core', 'revision', 'gate', 'sem', 'sub_'];
  const topicSubjectMap = new Map<string, string>();
  for (const t of activeTopics) {
    topicSubjectMap.set(t.id, t.subjectCode);
  }
  let totalStudyMinutes = 0;
  if (input.focusSessions) {
    for (const fs of input.focusSessions) {
      if (fs.completed && fs.mode === 'work') {
        const titleLower = (fs.taskTitle || '').toLowerCase();
        const isStudyKeyword = studyFocusKeywords.some((k) => titleLower.includes(k));
        const isStudyLinked = Boolean(fs.subjectId || fs.subjectCode || fs.topicId);
        if (isStudyKeyword || isStudyLinked) {
          totalStudyMinutes += getSessionActualMins(fs);
        }
      }
    }
  }

  // Per-subject breakdown
  const subjectBreakdown = activeSubjects.map((sub) => {
    const subTopics = activeTopics.filter((t) => t.subjectCode === sub.code);
    const subTotal = subTopics.length;
    const subDone = subTopics.filter((t) => t.theory && t.practice).length;
    const pct = subTotal > 0 ? Math.min(100, Math.round((subDone / subTotal) * 100)) : 0;

    let subjectStudyMinutes = 0;
    if (input.focusSessions) {
      for (const fs of input.focusSessions) {
        const resolvedSubCode = fs.subjectCode || (fs.topicId ? topicSubjectMap.get(fs.topicId) : undefined);
        const matchesSub = resolvedSubCode === sub.code || (fs.subjectId && (fs.subjectId === sub.id || fs.subjectId === sub.code));
        if (fs.completed && fs.mode === 'work' && matchesSub) {
          subjectStudyMinutes += getSessionActualMins(fs);
        }
      }
    }

    return {
      code: sub.code,
      name: sub.name,
      tierId: sub.tierId,
      total: subTotal,
      completed: subDone,
      completionPct: pct,
      color: sub.color,
      studyMinutes: subjectStudyMinutes,
    };
  });

  return {
    overallCompletionPct,
    totalTopics,
    completedTopics,
    theoryCompleted,
    practiceCompleted,
    pyqCompleted,
    dueRevisionsCount: dueToday.length,
    overdueRevisionsCount: overdue.length,
    masteredRevisionsCount: mastered.length,
    totalMistakesCount,
    unresolvedMistakesCount,
    highSeverityMistakesCount,
    totalStudyMinutes,
    subjectBreakdown,
  };
}

// ==========================================
// PHASE 16 STUDY INTELLIGENCE EXTENSIONS
// ==========================================

import type {
  StudyGoal,
  StudyPlan,
  StudyPlanTask,
  StudyResource,
  StudyExam,
  StudyNote,
  StudyFlashcard,
  StudyQuiz,
  StudyExportPayload,
} from '../types/study.ts';

export interface StudyPlanAnalytics {
  totalPlannedMinutes: number;
  totalActualMinutes: number;
  completedTasksCount: number;
  pendingTasksCount: number;
  adherencePercentage: number;
}

export function computeStudyPlanAnalytics(
  tasks: StudyPlanTask[],
  focusSessions: FocusSession[] = []
): StudyPlanAnalytics {
  const activeTasks = tasks.filter((t) => !t.deletedAt);
  const totalPlannedMinutes = activeTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

  // Authoritative actual minutes derived from task records or completed focus sessions
  const taskActualMinutes = activeTasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);

  const planTaskIds = new Set(activeTasks.map((t) => t.id));
  const planTopicIds = new Set(activeTasks.map((t) => t.topicId).filter((id): id is string => Boolean(id)));
  const planSubjectIds = new Set(activeTasks.map((t) => t.subjectId).filter((id): id is string => Boolean(id)));
  const planTitles = new Set(activeTasks.map((t) => t.title.toLowerCase().trim()).filter(Boolean));
  const planIds = new Set(activeTasks.map((t) => t.planId).filter((id): id is string => Boolean(id)));

  // Count ONLY completed work sessions that are associated with the relevant plan/tasks
  const sessionMins = activeTasks.length === 0 ? 0 : focusSessions
    .filter((fs) => {
      if (!fs.completed || fs.mode !== 'work') return false;
      const matchesTaskId = Boolean(fs.taskId && planTaskIds.has(fs.taskId));
      const matchesPlanId = Boolean((fs as unknown as { planId?: string }).planId && planIds.has((fs as unknown as { planId?: string }).planId!));
      const matchesTopicId = Boolean(fs.topicId && planTopicIds.has(fs.topicId));
      const matchesSubjectId = Boolean(
        (fs.subjectId && planSubjectIds.has(fs.subjectId)) ||
        ((fs as unknown as { subjectCode?: string }).subjectCode && planSubjectIds.has((fs as unknown as { subjectCode?: string }).subjectCode!))
      );
      const matchesTitle = Boolean(fs.taskTitle && planTitles.has(fs.taskTitle.toLowerCase().trim()));
      return matchesTaskId || matchesPlanId || matchesTopicId || matchesSubjectId || matchesTitle;
    })
    .reduce((sum, fs) => {
      const effectiveSecs =
        typeof fs.actualDurationSeconds === 'number' && !Number.isNaN(fs.actualDurationSeconds)
          ? fs.actualDurationSeconds
          : typeof fs.durationSeconds === 'number' && !Number.isNaN(fs.durationSeconds)
          ? fs.durationSeconds
          : (fs.durationMinutes || 0) * 60;
      return sum + Math.round(effectiveSecs / 60);
    }, 0);

  const totalActualMinutes = Math.max(taskActualMinutes, sessionMins);
  const completedTasksCount = activeTasks.filter((t) => t.status === 'completed').length;
  const pendingTasksCount = activeTasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length;

  const adherencePercentage =
    totalPlannedMinutes > 0
      ? Math.min(100, Math.round((totalActualMinutes / totalPlannedMinutes) * 100))
      : 100;

  return {
    totalPlannedMinutes,
    totalActualMinutes,
    completedTasksCount,
    pendingTasksCount,
    adherencePercentage,
  };
}

export function computeStudyGoalProgress(goal: StudyGoal): {
  percentage: number;
  isComplete: boolean;
  milestonesDone: number;
  milestonesTotal: number;
} {
  const target = Math.max(1, goal.targetValue || 1);
  const current = Math.max(0, goal.currentValue || 0);
  const milestones = goal.milestones || [];
  const milestonesDone = milestones.filter((m) => m.completed).length;
  const milestonesTotal = milestones.length;

  let percentage = Math.min(100, Math.round((current / target) * 100));
  if (milestonesTotal > 0 && current === 0) {
    percentage = Math.round((milestonesDone / milestonesTotal) * 100);
  }

  return {
    percentage,
    isComplete: percentage >= 100 || goal.status === 'completed',
    milestonesDone,
    milestonesTotal,
  };
}

export function computeStudyExamReadiness(
  exam: StudyExam,
  topics: StudyTopic[],
  timezoneOrTodayStr?: string
): {
  coveredTopicsCount: number;
  totalSyllabusTopicsCount: number;
  readinessPct: number;
  daysRemaining: number;
} {
  const todayStr =
    timezoneOrTodayStr && /^\d{4}-\d{2}-\d{2}$/.test(timezoneOrTodayStr)
      ? timezoneOrTodayStr
      : getTodayDateString(timezoneOrTodayStr || DEFAULT_TIMEZONE);
  const examDate = new Date(`${exam.examDate}T00:00:00Z`);
  const today = new Date(`${todayStr}T00:00:00Z`);
  const diffDays = Math.ceil((examDate.getTime() - today.getTime()) / 86400000);

  const syllabusSet = new Set(exam.syllabusTopicIds || []);
  const relevantTopics = topics.filter((t) => !t.deletedAt && (syllabusSet.has(t.id) || (exam.subjectIds || []).includes(t.subjectCode)));
  const total = relevantTopics.length;
  const covered = relevantTopics.filter((t) => t.theory && t.practice).length;
  const readinessPct = total > 0 ? Math.min(100, Math.round((covered / total) * 100)) : 0;

  return {
    coveredTopicsCount: covered,
    totalSyllabusTopicsCount: total,
    readinessPct,
    daysRemaining: diffDays,
  };
}

export interface StudySearchResult {
  id: string;
  type: 'subject' | 'topic' | 'note' | 'resource' | 'exam' | 'plan' | 'flashcard';
  title: string;
  subtitle: string;
  tag?: string;
  matchedField: string;
}

export function searchStudyWorkspace(
  query: string,
  workspace: {
    subjects: StudySubject[];
    topics: StudyTopic[];
    notes: StudyNote[];
    resources: StudyResource[];
    exams: StudyExam[];
    plans: StudyPlan[];
    flashcards: StudyFlashcard[];
  }
): StudySearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: StudySearchResult[] = [];

  // Search Subjects
  for (const s of workspace.subjects.filter((s) => !s.deletedAt)) {
    if (s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) {
      results.push({
        id: s.id,
        type: 'subject',
        title: s.name,
        subtitle: `${s.code} • ${s.semesterOrDomain || 'Subject'}`,
        tag: s.code,
        matchedField: 'name',
      });
    }
  }

  // Search Topics
  for (const t of workspace.topics.filter((t) => !t.deletedAt)) {
    if (
      t.topic.toLowerCase().includes(q) ||
      t.subtopic.toLowerCase().includes(q) ||
      t.unit.toLowerCase().includes(q)
    ) {
      results.push({
        id: t.id,
        type: 'topic',
        title: t.subtopic,
        subtitle: `${t.subjectCode} • ${t.unit} • ${t.topic}`,
        tag: t.priority,
        matchedField: 'topic',
      });
    }
  }

  // Search Notes
  for (const n of workspace.notes.filter((n) => !n.deletedAt)) {
    if (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)) {
      results.push({
        id: n.id,
        type: 'note',
        title: n.title,
        subtitle: n.content.slice(0, 60),
        tag: n.isPinned ? 'Pinned' : undefined,
        matchedField: 'title/content',
      });
    }
  }

  // Search Resources
  for (const r of workspace.resources.filter((r) => !r.deletedAt)) {
    if (r.title.toLowerCase().includes(q) || (r.url && r.url.toLowerCase().includes(q))) {
      results.push({
        id: r.id,
        type: 'resource',
        title: r.title,
        subtitle: r.resourceType.toUpperCase(),
        tag: r.resourceType,
        matchedField: 'title',
      });
    }
  }

  // Search Exams
  for (const e of workspace.exams.filter((e) => !e.deletedAt)) {
    if (e.title.toLowerCase().includes(q) || e.examType.toLowerCase().includes(q)) {
      results.push({
        id: e.id,
        type: 'exam',
        title: e.title,
        subtitle: `Exam on ${e.examDate} • ${e.examType}`,
        tag: e.preparationStatus,
        matchedField: 'title',
      });
    }
  }

  // Search Flashcards
  for (const f of workspace.flashcards.filter((f) => !f.deletedAt)) {
    if (f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)) {
      results.push({
        id: f.id,
        type: 'flashcard',
        title: f.question,
        subtitle: `Answer: ${f.answer.slice(0, 60)}`,
        tag: f.difficulty,
        matchedField: 'question',
      });
    }
  }

  return results.slice(0, 25);
}

export function validateStudyExportPayload(data: unknown): StudyExportPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.version !== 'number' || typeof obj.userId !== 'string') {
    return null;
  }

  return {
    version: obj.version,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    userId: obj.userId,
    subjects: Array.isArray(obj.subjects) ? (obj.subjects as StudySubject[]) : [],
    topics: Array.isArray(obj.topics) ? (obj.topics as StudyTopic[]) : [],
    revisions: Array.isArray(obj.revisions) ? (obj.revisions as StudyRevision[]) : [],
    mistakes: Array.isArray(obj.mistakes) ? (obj.mistakes as StudyMistake[]) : [],
    goals: Array.isArray(obj.goals) ? (obj.goals as StudyGoal[]) : [],
    plans: Array.isArray(obj.plans) ? (obj.plans as StudyPlan[]) : [],
    planTasks: Array.isArray(obj.planTasks) ? (obj.planTasks as StudyPlanTask[]) : [],
    resources: Array.isArray(obj.resources) ? (obj.resources as StudyResource[]) : [],
    exams: Array.isArray(obj.exams) ? (obj.exams as StudyExam[]) : [],
    notes: Array.isArray(obj.notes) ? (obj.notes as StudyNote[]) : [],
    flashcards: Array.isArray(obj.flashcards) ? (obj.flashcards as StudyFlashcard[]) : [],
    quizzes: Array.isArray(obj.quizzes) ? (obj.quizzes as StudyQuiz[]) : [],
  };
}
