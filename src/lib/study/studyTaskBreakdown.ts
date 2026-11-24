/**
 * FocusFlow & Finance — Smart Syllabus Task Breakdown Engine
 *
 * Converts matched syllabus subjects, units, and selected topics into
 * structured Task blueprints:
 * 1. Parent Task with Subtasks Mode:
 *    One overarching parent task for the module/chapter with subtasks for each selected subtopic.
 * 2. Individual Tasks Mode:
 *    Separate standalone tasks for each selected subtopic for granular scheduling.
 *
 * Features:
 * - Smart academic title formatting: [Subject Code] Unit X: Topic / Subtopic
 * - Timezone-safe due date propagation
 * - Pomodoro estimation allocation (balanced or per-subtopic)
 * - Active task cross-referencing and duplicate detection
 */

import { StudySubject, StudyTopic } from '../../types/study.ts';
import { Task, SubtaskItem } from '../../types/index.ts';
import { ParsedStudyCommand } from './studyCommandParser.ts';
import { MatchedTopicItem, normalizeText } from './studyCatalogMatcher.ts';

export type TaskBreakdownMode = 'parent_with_subtasks' | 'individual_tasks';

export interface TaskBlueprint {
  id?: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo';
  dueDate: string | null;
  estimatedPomodoros: number;
  category: string;
  subtasks: SubtaskItem[];
  // Study linkage metadata
  subjectId: string | null;
  subjectCode: string | null;
  topicId: string | null;
  unit: string | null;
  subtopicTitle: string | null;
  // Duplicate check metadata
  isDuplicate?: boolean;
  duplicateReason?: string;
  // Source topic IDs included in this blueprint
  sourceTopicIds: string[];
}

export interface TaskBreakdownOptions {
  mode: TaskBreakdownMode;
  subject: StudySubject;
  unitName: string;
  selectedTopics: StudyTopic[];
  command: ParsedStudyCommand;
  existingTasks?: Task[];
  customDueDate?: string | null;
  customPriority?: 'low' | 'medium' | 'high';
  customPomodoros?: number;
}

/**
 * Checks whether a candidate task title or topicId already exists in active tasks.
 */
export function checkDuplicateTask(
  candidateTitle: string,
  candidateTopicId: string | null,
  candidateSubjectCode: string | null,
  activeTasks: Task[]
): { isDuplicate: boolean; reason?: string } {
  const normTitle = normalizeText(candidateTitle);
  const normCode = candidateSubjectCode ? normalizeText(candidateSubjectCode) : '';

  for (const t of activeTasks) {
    if (t.deletedAt || t.status === 'completed') continue;

    // 1. Direct topicId match
    if (candidateTopicId && (t as any).topicId === candidateTopicId) {
      return {
        isDuplicate: true,
        reason: `An active task "${t.title}" is already linked to this topic.`,
      };
    }

    // 2. Exact or close title match
    const existingNorm = normalizeText(t.title);
    if (existingNorm === normTitle) {
      return {
        isDuplicate: true,
        reason: `A task with the exact title "${t.title}" already exists.`,
      };
    }

    // 3. Substring match if both contain subject code and subtopic name
    if (
      normTitle.length > 5 &&
      (existingNorm.includes(normTitle) || normTitle.includes(existingNorm)) &&
      (!normCode || existingNorm.includes(normCode) || normTitle.includes(normCode))
    ) {
      return {
        isDuplicate: true,
        reason: `Similar active task found: "${t.title}".`,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Generates task blueprints according to the selected mode.
 */
export function generateTaskBlueprints(options: TaskBreakdownOptions): TaskBlueprint[] {
  const {
    mode,
    subject,
    unitName,
    selectedTopics,
    command,
    existingTasks = [],
    customDueDate,
    customPriority,
    customPomodoros,
  } = options;

  if (selectedTopics.length === 0) {
    return [];
  }

  const priority: 'low' | 'medium' | 'high' = customPriority || command.priority || 'medium';
  const dueDate: string | null =
    customDueDate !== undefined ? customDueDate : command.dueDate || null;
  const category = 'Learning';

  const cleanSubjectCode = subject.code.replace(/^Sub_/i, '');

  if (mode === 'parent_with_subtasks') {
    // Single parent task with subtasks
    const distinctTopics = Array.from(new Set(selectedTopics.map((t) => t.topic.trim())));
    const topicSummary =
      distinctTopics.length <= 2
        ? distinctTopics.join(' & ')
        : `${distinctTopics[0]} and ${distinctTopics.length - 1} more topics`;

    const parentTitle = `[${cleanSubjectCode}] ${unitName}: ${topicSummary}`;

    // Subtasks from selected topics
    const subtasks: SubtaskItem[] = selectedTopics.map((t, idx) => ({
      id: `sub_${Date.now()}_${idx}`,
      title: `${t.subtopic}${t.practice && !t.theory ? ' (Practice)' : ''}`,
      done: Boolean(t.theory && t.practice),
    }));

    // Pomodoros: either custom specified or command estimated, default to ~1-2 pomodoros per 2 subtasks (min 1, max 20)
    const calculatedPomodoros =
      customPomodoros && customPomodoros > 0
        ? customPomodoros
        : command.estimatedPomodoros > 0
        ? command.estimatedPomodoros
        : Math.max(1, Math.min(20, Math.ceil(selectedTopics.length * 1.5)));

    const dupCheck = checkDuplicateTask(
      parentTitle,
      selectedTopics[0]?.id || null,
      subject.code,
      existingTasks
    );

    const description = [
      `📚 Subject: ${subject.name} (${subject.code})`,
      `📑 Unit / Module: ${unitName}`,
      `🎯 Subtopics covered (${selectedTopics.length}):`,
      ...selectedTopics.map((t) => `  • ${t.topic} → ${t.subtopic}`),
      command.rawText ? `\n💬 Source Goal: "${command.rawText}"` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return [
      {
        title: parentTitle,
        description,
        priority,
        status: 'todo',
        dueDate,
        estimatedPomodoros: calculatedPomodoros,
        category,
        subtasks,
        subjectId: subject.id,
        subjectCode: subject.code,
        topicId: selectedTopics.length === 1 ? selectedTopics[0].id : null,
        unit: unitName,
        subtopicTitle: selectedTopics.length === 1 ? selectedTopics[0].subtopic : null,
        isDuplicate: dupCheck.isDuplicate,
        duplicateReason: dupCheck.reason,
        sourceTopicIds: selectedTopics.map((t) => t.id),
      },
    ];
  }

  // Individual Tasks Mode
  return selectedTopics.map((t, idx) => {
    const taskTitle = `[${cleanSubjectCode}] ${t.subtopic}`;
    const taskPomodoro =
      customPomodoros && customPomodoros > 0
        ? Math.max(1, Math.round(customPomodoros / selectedTopics.length))
        : 1;

    const dupCheck = checkDuplicateTask(taskTitle, t.id, subject.code, existingTasks);

    const description = [
      `📚 Subject: ${subject.name} (${subject.code})`,
      `📑 Unit: ${t.unit}`,
      `📌 Topic: ${t.topic}`,
      `🔍 Subtopic: ${t.subtopic}`,
      command.rawText ? `💬 Source Goal: "${command.rawText}"` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      title: taskTitle,
      description,
      priority,
      status: 'todo',
      dueDate,
      estimatedPomodoros: Math.max(1, taskPomodoro),
      category,
      subtasks: [],
      subjectId: subject.id,
      subjectCode: subject.code,
      topicId: t.id,
      unit: t.unit,
      subtopicTitle: t.subtopic,
      isDuplicate: dupCheck.isDuplicate,
      duplicateReason: dupCheck.reason,
      sourceTopicIds: [t.id],
    };
  });
}
