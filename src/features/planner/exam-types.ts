/**
 * FocusFlow & Finance — Exam Countdown & Syllabus Progress Helpers (Phase 7)
 */

import { DEFAULT_TIMEZONE, formatDateInTimezone } from '../../lib/dateTime.ts';

export interface ExamTopic {
  id: string;
  title: string;
  completed: boolean;
}

export interface StudyExam {
  id: string;
  title: string;
  subjectId: string;
  examDate: number;
  topics: ExamTopic[];
  createdAt: number;
  updatedAt: number;
}

export function calculateSyllabusProgress(topics: ExamTopic[]): number {
  if (topics.length === 0) return 0;
  const completed = topics.filter((topic) => topic.completed).length;
  return Math.round((completed / topics.length) * 100);
}

export function calculateDaysRemaining(
  examDate: number,
  now: number,
  timezone: string = DEFAULT_TIMEZONE
): number {
  const examDay = formatDateInTimezone(new Date(examDate), timezone);
  const todayDay = formatDateInTimezone(new Date(now), timezone);
  const examMs = Date.parse(`${examDay}T00:00:00Z`);
  const todayMs = Date.parse(`${todayDay}T00:00:00Z`);
  if (Number.isNaN(examMs) || Number.isNaN(todayMs)) return 0;
  const diffDays = Math.round((examMs - todayMs) / 86400000);
  // Never return a negative countdown as if upcoming
  return Math.max(0, diffDays);
}

export function isExamOverdue(
  examDate: number,
  now: number,
  timezone: string = DEFAULT_TIMEZONE
): boolean {
  const examDay = formatDateInTimezone(new Date(examDate), timezone);
  const todayDay = formatDateInTimezone(new Date(now), timezone);
  return examDay < todayDay;
}

