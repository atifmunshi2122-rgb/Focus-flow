import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTaskPriority } from '../src/features/planner/task-priority.ts';
import { generateStudyPlan } from '../src/features/planner/generate-study-plan.ts';
import {
  calculateDaysRemaining,
  calculateSyllabusProgress,
  isExamOverdue,
} from '../src/features/planner/exam-types.ts';
import { scheduleRevision } from '../src/features/planner/spaced-repetition.ts';
import { suggestReschedule } from '../src/features/planner/rescheduling.ts';
import { defaultStudyPlannerSettings, type StudyTask } from '../src/features/planner/types.ts';

describe('Phase 7 — Smart Productivity, AI-Free Study Planner, Exams, Revision & Rescheduling', () => {
  it('computes deterministic task priority with transparent reasons and excludes completed tasks', () => {
    const now = Date.parse('2026-11-26T09:00:00Z');
    const urgentTask: StudyTask = {
      id: 't1',
      title: 'OS Deadlocks',
      priority: 'urgent',
      estimatedMinutes: 90,
      deadline: now + 12 * 3600_000,
      difficulty: 4,
      completed: false,
      createdAt: now - 1000,
    };
    const doneTask: StudyTask = { ...urgentTask, id: 't2', completed: true };

    const p1 = calculateTaskPriority(urgentTask, now);
    assert.ok(p1.score > 150);
    assert.equal(p1.reasons.some((r) => r.includes('24 hours')), true);

    const pDone = calculateTaskPriority(doneTask, now);
    assert.equal(pDone.score, 0);
  });

  it('generates conflict-free study plans, preserves locked sessions, inserts breaks, and explains unscheduled tasks', () => {
    const dayStart = Date.parse('2026-11-26T09:00:00+05:30');
    const dayEnd = Date.parse('2026-11-26T13:00:00+05:30');

    const tasks: StudyTask[] = [
      {
        id: 't_main',
        title: 'DBMS Indexing',
        priority: 'high',
        estimatedMinutes: 90,
        completed: false,
        createdAt: dayStart - 1000,
      },
      {
        id: 't_zero',
        title: 'Zero Duration',
        priority: 'low',
        estimatedMinutes: 0,
        completed: false,
        createdAt: dayStart - 1000,
      },
    ];

    const locked = [
      {
        id: 'locked_1',
        taskId: 't_locked',
        startAt: dayStart,
        endAt: dayStart + 30 * 60000,
        durationMinutes: 30,
        reason: 'Manually locked',
        generated: false,
        locked: true,
      },
    ];

    const plan = generateStudyPlan({
      tasks,
      windows: [{ start: dayStart, end: dayEnd }],
      settings: { ...defaultStudyPlannerSettings, sessionDurationMinutes: 45, breakDurationMinutes: 10 },
      now: dayStart,
      lockedSessions: locked,
      timezone: 'Asia/Kolkata',
    });

    // Locked session preserved at exact start
    assert.equal(plan.sessions[0].id, 'locked_1');
    // Generated sessions start after locked session, without overlap
    assert.ok(plan.sessions.length >= 2);
    for (let i = 1; i < plan.sessions.length; i++) {
      assert.ok(plan.sessions[i].startAt >= plan.sessions[i - 1].endAt);
    }
    assert.equal(plan.unscheduled.some((u) => u.taskId === 't_zero'), true);
  });

  it('computes exam syllabus progress and non-negative timezone-safe countdowns', () => {
    const now = Date.parse('2026-11-26T10:00:00+05:30');
    const futureExam = Date.parse('2026-12-01T09:00:00+05:30');
    const pastExam = Date.parse('2026-11-20T09:00:00+05:30');

    assert.equal(calculateDaysRemaining(futureExam, now, 'Asia/Kolkata'), 5);
    assert.equal(calculateDaysRemaining(pastExam, now, 'Asia/Kolkata'), 0);
    assert.equal(isExamOverdue(pastExam, now, 'Asia/Kolkata'), true);
    assert.equal(
      calculateSyllabusProgress([
        { id: '1', title: 'A', completed: true },
        { id: '2', title: 'B', completed: false },
      ]),
      50
    );
  });

  it('schedules spaced repetition intervals deterministically and prevents duplicate rapid submissions', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    const initial = {
      topicId: 'top1',
      repetition: 0,
      intervalDays: 1,
      nextReviewAt: now,
      status: 'due' as const,
    };

    const good = scheduleRevision(initial, 'good', now);
    assert.equal(good.repetition, 1);
    assert.equal(good.intervalDays, 7);

    // Duplicate within 30s ignored
    const dup = scheduleRevision(good, 'easy', now + 5000);
    assert.equal(dup.intervalDays, 7);

    const again = scheduleRevision(good, 'again', now + 60_000);
    assert.equal(again.repetition, 0);
    assert.equal(again.intervalDays, 1);
  });

  it('suggests conflict-free missed task reschedule respecting deadlines and locked sessions', () => {
    const now = Date.parse('2026-11-26T10:00:00Z');
    const task: StudyTask = {
      id: 't_miss',
      title: 'Missed Task',
      priority: 'high',
      estimatedMinutes: 45,
      deadline: now + 5 * 3600_000,
      completed: false,
      createdAt: now - 7200_000,
    };
    const missed = {
      id: 'm1',
      taskId: 't_miss',
      startAt: now - 3600_000,
      endAt: now - 900_000,
      durationMinutes: 45,
      reason: 'Scheduled',
      generated: true,
    };
    const conflict = {
      id: 'c1',
      taskId: 'other',
      startAt: now,
      endAt: now + 3600_000,
      durationMinutes: 60,
      reason: 'Busy',
      generated: false,
    };

    const sug = suggestReschedule(
      task,
      missed,
      [{ start: now + 3600_000, end: now + 4 * 3600_000 }],
      [conflict],
      now
    );
    assert.ok(sug);
    assert.equal(sug.requiresApproval, true);
    assert.ok(sug.suggestedStartAt >= conflict.endAt);
  });
});

