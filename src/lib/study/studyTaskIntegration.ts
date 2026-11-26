/**
 * FocusFlow & Finance — Smart Syllabus Task Integration & Progress Tracker
 *
 * Orchestrates:
 * 1. Task creation in the task manager from TaskBlueprints.
 * 2. Bidirectional study progress tracking:
 *    When a task (or parent task subtask) linked to a syllabus topic is completed,
 *    automatically updates the corresponding StudyTopic (theory, practice) and
 *    recomputes StudySubject completion stats without double counting.
 */

import { Task, SubtaskItem } from '../../types/index.ts';
import { StudySubject, StudyTopic } from '../../types/study.ts';
import { TaskBlueprint } from './studyTaskBreakdown.ts';

export interface TaskCreationResult {
  createdTasks: Task[];
  failedCount: number;
  errors: string[];
}

export type TaskCreatorFn = (taskData: Partial<Task>) => Promise<Task>;
export type TopicSaverFn = (topicData: Partial<StudyTopic>) => Promise<StudyTopic>;
export type SubjectSaverFn = (subjectData: Partial<StudySubject>) => Promise<StudySubject>;

/**
 * Creates tasks in the system from generated blueprints.
 */
export async function createSyllabusTasks(
  blueprints: TaskBlueprint[],
  taskCreator: TaskCreatorFn
): Promise<TaskCreationResult> {
  const createdTasks: Task[] = [];
  const errors: string[] = [];
  let failedCount = 0;

  for (const bp of blueprints) {
    try {
      const taskInput: Partial<Task> = {
        title: bp.title,
        description: bp.description,
        priority: bp.priority,
        status: bp.status,
        dueDate: bp.dueDate,
        estimatedPomodoros: bp.estimatedPomodoros,
        category: bp.category,
        subtasks: bp.subtasks,
        // Study linkage metadata
        subjectId: bp.subjectId,
        subjectCode: bp.subjectCode,
        topicId: bp.topicId,
        unit: bp.unit,
        subtopicTitle: bp.subtopicTitle,
      };

      const created = await taskCreator(taskInput);
      createdTasks.push(created);
    } catch (err: any) {
      failedCount++;
      errors.push(`Failed to create task "${bp.title}": ${err?.message || String(err)}`);
    }
  }

  return {
    createdTasks,
    failedCount,
    errors,
  };
}

export interface ProgressUpdateResult {
  updatedTopicIds: string[];
  updatedSubjectCodes: string[];
  totalSubtopicsCompletedDelta: number;
}

/**
 * Evaluates a completed or updated task and syncs study syllabus progress.
 *
 * Called whenever:
 * - A task is marked status = 'completed'
 * - A parent task's subtasks are toggled
 */
export async function syncStudyProgressFromTask(
  task: Task,
  allTopics: StudyTopic[],
  allSubjects: StudySubject[],
  topicSaver: TopicSaverFn,
  subjectSaver?: SubjectSaverFn
): Promise<ProgressUpdateResult> {
  const updatedTopicIds: string[] = [];
  const processedTopicIds = new Set<string>();
  const subjectDeltaMap = new Map<string, number>();

  // Helper to mark a single topic complete (strictly idempotent within a sync run)
  const markTopicComplete = async (topic: StudyTopic) => {
    if (processedTopicIds.has(topic.id)) {
      return;
    }
    processedTopicIds.add(topic.id);

    // If already fully completed, do nothing (idempotent, no double counting)
    if (topic.theory && topic.practice) {
      return;
    }

    const updated: Partial<StudyTopic> = {
      ...topic,
      theory: true,
      practice: true,
      updatedAt: new Date().toISOString(),
    };

    await topicSaver(updated);
    updatedTopicIds.push(topic.id);

    const sCode = topic.subjectCode;
    const currentDelta = subjectDeltaMap.get(sCode) || 0;
    subjectDeltaMap.set(sCode, currentDelta + 1);
  };

  // Case 1: Individual task with direct topicId
  if (task.status === 'completed' && (task as any).topicId) {
    const topicId = (task as any).topicId as string;
    const targetTopic = allTopics.find((t) => t.id === topicId);
    if (targetTopic) {
      await markTopicComplete(targetTopic);
    }
  }

  // Case 2: Parent task with subtasks
  if (task.subtasks && task.subtasks.length > 0) {
    const isParentCompleted = task.status === 'completed';
    const taskSubjectCode = ((task as any).subjectCode || '').toLowerCase();

    for (const sub of task.subtasks) {
      // If parent is marked completed or this specific subtask is done
      if (isParentCompleted || sub.done) {
        const cleanSubTitle = sub.title
          .replace(/\s*\((?:Practice|Theory|Revision)\)\s*$/i, '')
          .trim()
          .toLowerCase();

        // Find matching topic in allTopics
        const matched = allTopics.find((t) => {
          if (t.deletedAt) return false;
          if (taskSubjectCode && t.subjectCode.toLowerCase() !== taskSubjectCode) {
            return false;
          }
          return t.subtopic.trim().toLowerCase() === cleanSubTitle;
        });

        if (matched) {
          await markTopicComplete(matched);
        }
      }
    }
  }

  // Case 3: Title fallback if topicId is not set, but task is completed and has subjectCode
  if (task.status === 'completed' && !(task as any).topicId && (task as any).subjectCode) {
    const subjectCode = ((task as any).subjectCode as string).toLowerCase();
    const subtopicTitle = ((task as any).subtopicTitle || '').trim().toLowerCase();

    if (subtopicTitle) {
      const matched = allTopics.find(
        (t) =>
          !t.deletedAt &&
          t.subjectCode.toLowerCase() === subjectCode &&
          t.subtopic.trim().toLowerCase() === subtopicTitle
      );
      if (matched) {
        await markTopicComplete(matched);
      }
    }
  }

  // Update subjects if delta > 0 and subjectSaver is provided
  const updatedSubjectCodes: string[] = [];
  let totalDelta = 0;

  if (subjectSaver && subjectDeltaMap.size > 0) {
    for (const [sCode, delta] of subjectDeltaMap.entries()) {
      if (delta <= 0) continue;
      totalDelta += delta;

      const subject = allSubjects.find(
        (s) => s.code.toLowerCase() === sCode.toLowerCase() && !s.deletedAt
      );

      if (subject) {
        const newCompleted = Math.min(
          subject.totalSubtopics,
          (subject.completedSubtopics || 0) + delta
        );

        await subjectSaver({
          ...subject,
          completedSubtopics: newCompleted,
          updatedAt: new Date().toISOString(),
        });
        updatedSubjectCodes.push(subject.code);
      }
    }
  }

  return {
    updatedTopicIds,
    updatedSubjectCodes,
    totalSubtopicsCompletedDelta: totalDelta,
  };
}
