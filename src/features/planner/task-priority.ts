/**
 * FocusFlow & Finance — Deterministic Task Prioritization Engine (Phase 7)
 *
 * Pure rule-based scoring with transparent human-readable explanations.
 */

import type { StudyPriority, StudyTask } from './types.ts';

export const DEFAULT_PRIORITY_WEIGHTS: Record<StudyPriority, number> = {
  low: 10,
  medium: 30,
  high: 55,
  urgent: 75,
};

export interface TaskPriorityResult {
  taskId: string;
  score: number;
  isOverdue: boolean;
  reasons: string[];
}

export function calculateTaskPriority(
  task: StudyTask,
  now: number,
  weights: Record<StudyPriority, number> = DEFAULT_PRIORITY_WEIGHTS
): TaskPriorityResult {
  if (task.completed) {
    return {
      taskId: task.id,
      score: 0,
      isOverdue: false,
      reasons: ['Task already completed'],
    };
  }

  let score = weights[task.priority] ?? DEFAULT_PRIORITY_WEIGHTS.medium;
  const reasons: string[] = [`User priority: ${task.priority}`];
  let isOverdue = false;

  if (task.deadline) {
    const remainingHours = (task.deadline - now) / 3600000;
    if (remainingHours <= 0) {
      score += 100;
      isOverdue = true;
      reasons.push('Deadline has passed (overdue)');
    } else if (remainingHours <= 24) {
      score += 90;
      reasons.push('Deadline within 24 hours');
    } else if (remainingHours <= 72) {
      score += 60;
      reasons.push('Deadline within 3 days');
    } else if (remainingHours <= 168) {
      score += 30;
      reasons.push('Deadline within 7 days');
    }
  }

  if (task.difficulty) {
    score += task.difficulty * 5;
    reasons.push(`Difficulty level: ${task.difficulty}/5`);
  }

  if (task.estimatedMinutes > 120) {
    score += 10;
    reasons.push('Large task requiring multiple sessions');
  }

  return {
    taskId: task.id,
    score,
    isOverdue,
    reasons,
  };
}

