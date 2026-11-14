import {
  RevisionDifficulty,
  StudyMistake,
  StudyProgressSummary,
  StudyRevision,
  StudySubject,
  StudyTopic,
} from '../types/study.ts';
import { FocusSession } from '../types/index.ts';

export const REVISION_INTERVAL_LADDER = [1, 3, 7, 14, 30, 60] as const;

/**
 * Calculates next revision date string (YYYY-MM-DD) given base date and interval in days.
 * If only intervalDays is provided, calculates from today.
 */
export function calculateNextRevisionDate(
  baseDateStrOrDays: string | number,
  maybeIntervalDays?: number
): string {
  let baseDateStr: string;
  let intervalDays: number;

  if (typeof baseDateStrOrDays === 'number') {
    intervalDays = baseDateStrOrDays;
    baseDateStr = new Date().toISOString().slice(0, 10);
  } else {
    baseDateStr = baseDateStrOrDays;
    intervalDays = maybeIntervalDays ?? 1;
  }

  const base = new Date(`${baseDateStr.slice(0, 10)}T12:00:00Z`);
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + intervalDays);
  return next.toISOString().slice(0, 10);
}

/**
 * Applies Ebbinghaus spaced repetition recall feedback to update revision item state.
 */
export function processRevisionRecall(
  revision: StudyRevision,
  difficulty: RevisionDifficulty,
  reviewDateStr?: string
): StudyRevision {
  const todayStr = reviewDateStr || new Date().toISOString().slice(0, 10);
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

  const nextRevisionAt = calculateNextRevisionDate(todayStr, nextIntervalDays);

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
 */
export function categorizeRevisions(
  revisions: StudyRevision[],
  todayStr: string = new Date().toISOString().slice(0, 10)
): {
  dueToday: StudyRevision[];
  overdue: StudyRevision[];
  upcoming: StudyRevision[];
  mastered: StudyRevision[];
} {
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
}): StudyProgressSummary {
  const todayStr = input.todayStr || new Date().toISOString().slice(0, 10);
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
  const { dueToday, overdue, mastered } = categorizeRevisions(input.revisions, todayStr);

  // Mistakes metrics
  const totalMistakesCount = activeMistakes.length;
  const unresolvedMistakesCount = activeMistakes.filter((m) => !m.resolved).length;
  const highSeverityMistakesCount = activeMistakes.filter(
    (m) => !m.resolved && m.severity === 'High'
  ).length;

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
        const isStudyLinked = Boolean(fs.subjectCode || fs.topicId);
        if (isStudyKeyword || isStudyLinked) {
          const actualMins =
            typeof fs.durationSeconds === 'number' && fs.durationSeconds > 0
              ? Math.max(1, Math.round(fs.durationSeconds / 60))
              : (fs.durationMinutes || 0);
          totalStudyMinutes += actualMins;
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
        if (fs.completed && fs.mode === 'work' && resolvedSubCode === sub.code) {
          const actualMins =
            typeof fs.durationSeconds === 'number' && fs.durationSeconds > 0
              ? Math.max(1, Math.round(fs.durationSeconds / 60))
              : (fs.durationMinutes || 0);
          subjectStudyMinutes += actualMins;
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
  const sessionMins = focusSessions
    .filter((fs) => fs.completed && fs.mode === 'work')
    .reduce((sum, fs) => {
      const mins =
        typeof fs.durationSeconds === 'number' && fs.durationSeconds > 0
          ? Math.round(fs.durationSeconds / 60)
          : (fs.durationMinutes || 0);
      return sum + mins;
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
  topics: StudyTopic[]
): {
  coveredTopicsCount: number;
  totalSyllabusTopicsCount: number;
  readinessPct: number;
  daysRemaining: number;
} {
  const todayStr = new Date().toISOString().slice(0, 10);
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
