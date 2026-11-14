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

  // Study focus minutes from focus sessions (reflecting actual completed time)
  const studyFocusKeywords = ['study', 'dsa', 'exam', 'core', 'revision', 'gate', 'sem', 'sub_'];
  let totalStudyMinutes = 0;
  if (input.focusSessions) {
    for (const fs of input.focusSessions) {
      if (fs.completed) {
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
        if (fs.completed && fs.subjectCode === sub.code) {
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
