import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProductivityScore } from '../src/lib/productivityIntelligence.ts';
import type { FocusSession, Habit, Task, UserSettings } from '../src/types/index.ts';
import type { StudyPlanTask, StudyRevision, StudySubject } from '../src/types/study.ts';

const mockSettings: UserSettings = {
  userId: 'test_u1',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  pomodoroWorkDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  autoSwitchSessions: false,
  soundEnabled: true,
  theme: 'dark',
  dailyFocusGoalMinutes: 100,
};

test('Focus — Empty account returns zero', () => {
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.totalScore, 0);
  assert.equal(score.focusTimePoints, 0);
  assert.equal(score.taskCompletionPoints, 0);
  assert.equal(score.habitConsistencyPoints, 0);
  assert.equal(score.tier, 'Building Momentum');
});

test('Focus — Legacy completed session with undefined status is accepted', () => {
  const sessions: FocusSession[] = [
    {
      id: 'sess_1',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      status: undefined, // legacy
      startedAt: '2026-11-15T09:00:00+05:30',
      endedAt: '2026-11-15T09:25:00+05:30',
    },
  ];
  const score = computeProductivityScore({
    tasks: [],
    sessions,
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  // 25 mins of 100 min goal = 25%. Focus-only normalized to 100% weight -> 25 points.
  assert.equal(score.focusTimePoints, 25);
  assert.equal(score.totalScore, 25);
});

test('Focus — Interrupted and incomplete sessions are excluded', () => {
  const sessions: FocusSession[] = [
    {
      id: 'sess_interrupted',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      actualDurationSeconds: 600,
      completed: false,
      status: 'interrupted',
      interrupted: true,
      startedAt: '2026-11-15T09:00:00+05:30',
      endedAt: '2026-11-15T09:10:00+05:30',
    },
    {
      id: 'sess_in_progress',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: false,
      status: 'in_progress',
      startedAt: '2026-11-15T10:00:00+05:30',
      endedAt: null,
    },
  ];
  const score = computeProductivityScore({
    tasks: [],
    sessions,
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.focusTimePoints, 0);
  assert.equal(score.totalScore, 0);
});

test('Focus — Actual duration takes priority over planned duration for completed sessions', () => {
  const sessions: FocusSession[] = [
    {
      id: 'sess_stopwatch',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 0,
      durationSeconds: 0,
      actualDurationSeconds: 3000, // 50 mins
      completed: true,
      status: 'completed',
      startedAt: '2026-11-15T09:00:00+05:30',
      endedAt: '2026-11-15T09:50:00+05:30',
    },
  ];
  const score = computeProductivityScore({
    tasks: [],
    sessions,
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  // 50 mins of 100 min goal = 50%
  assert.equal(score.focusTimePoints, 50);
  assert.equal(score.totalScore, 50);
  assert.equal(score.tier, 'Steady Progress');
});

test('Focus — Break sessions are excluded', () => {
  const sessions: FocusSession[] = [
    {
      id: 'sess_break',
      userId: 'test_u1',
      taskId: null,
      mode: 'short_break',
      durationMinutes: 5,
      durationSeconds: 300,
      actualDurationSeconds: 300,
      completed: true,
      status: 'completed',
      startedAt: '2026-11-15T09:25:00+05:30',
      endedAt: '2026-11-15T09:30:00+05:30',
    },
  ];
  const score = computeProductivityScore({
    tasks: [],
    sessions,
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.focusTimePoints, 0);
  assert.equal(score.totalScore, 0);
});

test('Focus — Timezone boundary attribution works', () => {
  // 2026-11-15T01:30:00Z is 07:00 AM on 2026-11-15 in Asia/Kolkata (UTC+5:30)
  // but 20:30 PM on 2026-11-14 in America/New_York (UTC-5:00)
  const sessions: FocusSession[] = [
    {
      id: 'sess_tz',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 100,
      durationSeconds: 6000,
      actualDurationSeconds: 6000,
      completed: true,
      status: 'completed',
      startedAt: '2026-11-15T01:30:00Z',
      endedAt: '2026-11-15T03:10:00Z',
    },
  ];

  const scoreIST = computeProductivityScore({
    tasks: [],
    sessions,
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(scoreIST.focusTimePoints, 100);

  const scoreNY = computeProductivityScore({
    tasks: [],
    sessions,
    habits: [],
    settings: { ...mockSettings, timezone: 'America/New_York' },
    referenceDateStr: '2026-11-15',
    timezone: 'America/New_York',
  });
  assert.equal(scoreNY.focusTimePoints, 0); // On Nov 15 in NY, this session was yesterday
});

test('Tasks — Due-today completion, incomplete due-today task activates Tasks', () => {
  const tasks: Task[] = [
    {
      id: 't_due_1',
      userId: 'test_u1',
      title: 'Task 1',
      description: '',
      priority: 'high',
      status: 'completed',
      dueDate: '2026-11-15',
      completedAt: '2026-11-15T10:00:00+05:30',
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T10:00:00Z',
    },
    {
      id: 't_due_2',
      userId: 'test_u1',
      title: 'Task 2',
      description: '',
      priority: 'medium',
      status: 'todo',
      dueDate: '2026-11-15',
      completedAt: null,
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
  ];
  // 1/2 due tasks completed -> R_task = 0.50
  // Active: Focus (35) + Tasks (35) = 70.
  // Task points: round(35 * 0.50 / 70 * 100) = 25 pts.
  const score = computeProductivityScore({
    tasks,
    sessions: [],
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.taskCompletionPoints, 25);
  assert.equal(score.totalScore, 25);
});

test('Tasks — Ad-hoc completions: no due date, overdue, future due receive 0.20 each', () => {
  const tasks: Task[] = [
    {
      id: 't_no_due',
      userId: 'test_u1',
      title: 'Backlog task',
      description: '',
      priority: 'low',
      status: 'completed',
      dueDate: null,
      completedAt: '2026-11-15T11:00:00+05:30',
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-15T11:00:00Z',
    },
    {
      id: 't_overdue',
      userId: 'test_u1',
      title: 'Overdue task',
      description: '',
      priority: 'high',
      status: 'completed',
      dueDate: '2026-11-10',
      completedAt: '2026-11-15T12:00:00+05:30',
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      createdAt: '2026-11-08T00:00:00Z',
      updatedAt: '2026-11-15T12:00:00Z',
    },
    {
      id: 't_future',
      userId: 'test_u1',
      title: 'Future task',
      description: '',
      priority: 'medium',
      status: 'completed',
      dueDate: '2026-11-20',
      completedAt: '2026-11-15T13:00:00+05:30',
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      createdAt: '2026-11-14T00:00:00Z',
      updatedAt: '2026-11-15T13:00:00Z',
    },
  ];
  // 3 ad-hoc tasks = 3 * 0.20 = 0.60
  // Active: Focus (35) + Tasks (35) = 70.
  // Task points: round(35 * 0.60 / 70 * 100) = 30 pts.
  const score = computeProductivityScore({
    tasks,
    sessions: [],
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.taskCompletionPoints, 30);
  assert.equal(score.totalScore, 30);
});

test('Tasks — Old incomplete backlog alone does NOT activate Tasks category', () => {
  const tasks: Task[] = [
    {
      id: 't_backlog_1',
      userId: 'test_u1',
      title: 'Old task 1',
      description: '',
      priority: 'low',
      status: 'todo',
      dueDate: null,
      completedAt: null,
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
    {
      id: 't_backlog_2',
      userId: 'test_u1',
      title: 'Overdue uncompleted',
      description: '',
      priority: 'medium',
      status: 'todo',
      dueDate: '2026-11-10',
      completedAt: null,
      estimatedPomodoros: 1,
      completedPomodoros: 0,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];
  const sessions: FocusSession[] = [
    {
      id: 'sess_100',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 100,
      durationSeconds: 6000,
      actualDurationSeconds: 6000,
      completed: true,
      status: 'completed',
      startedAt: '2026-11-15T09:00:00+05:30',
      endedAt: '2026-11-15T10:40:00+05:30',
    },
  ];
  // Since 0 tasks were due today and 0 completed today, Tasks category is INACTIVE.
  // Focus is 100% (100 mins logged). Score should be 100, not penalized!
  const score = computeProductivityScore({
    tasks,
    sessions,
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.totalScore, 100);
  assert.equal(score.tier, 'Mastery');
});

test('Tasks — Deleted tasks are ignored and ratio never exceeds 1.0', () => {
  const tasks: Task[] = [
    {
      id: 't_deleted',
      userId: 'test_u1',
      title: 'Deleted task',
      description: '',
      priority: 'high',
      status: 'completed',
      dueDate: '2026-11-15',
      completedAt: '2026-11-15T10:00:00+05:30',
      deletedAt: '2026-11-15T11:00:00Z',
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T11:00:00Z',
    },
    // 6 ad-hoc tasks: 6 * 0.20 = 1.20 -> capped at 1.0
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `t_adhoc_${i}`,
      userId: 'test_u1',
      title: `Adhoc ${i}`,
      description: '',
      priority: 'low' as const,
      status: 'completed' as const,
      dueDate: null,
      completedAt: '2026-11-15T12:00:00+05:30',
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T12:00:00Z',
    })),
  ];
  const score = computeProductivityScore({
    tasks,
    sessions: [],
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  // Active: Focus (35) + Tasks (35) = 70. R_task = 1.0 -> 35/70 * 100 = 50 pts.
  assert.equal(score.taskCompletionPoints, 50);
});

test('Habits — Daily scheduled completion vs incomplete', () => {
  const habits: Habit[] = [
    {
      id: 'h_daily_done',
      userId: 'test_u1',
      title: 'Drink Water',
      category: 'Health',
      color: '#3b82f6',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: ['2026-11-15'],
      bestStreakDays: 5,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
    {
      id: 'h_daily_missed',
      userId: 'test_u1',
      title: 'Meditate',
      category: 'Mindfulness',
      color: '#10b981',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: [],
      bestStreakDays: 2,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];
  // 1 of 2 daily habits done = 50%
  // Active: Focus (35) + Habits (20) = 55.
  // Habit points: round(20 * 0.5 / 55 * 100) = 18 pts.
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits,
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.habitConsistencyPoints, 18);
  assert.equal(score.totalScore, 18);
});

test('Habits — Custom scheduled day vs off-schedule completion receives no credit', () => {
  // 2026-11-15 is Sunday (dayOfWeek = 0)
  const habits: Habit[] = [
    {
      id: 'h_custom_sun',
      userId: 'test_u1',
      title: 'Sunday Review',
      category: 'Planning',
      color: '#8b5cf6',
      frequency: 'custom',
      customDays: [0], // Sunday
      targetDaysPerWeek: 1,
      completedDates: ['2026-11-15'],
      bestStreakDays: 3,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
    {
      id: 'h_custom_weekday',
      userId: 'test_u1',
      title: 'Gym (Mon/Wed/Fri)',
      category: 'Fitness',
      color: '#ef4444',
      frequency: 'custom',
      customDays: [1, 3, 5], // Not Sunday
      targetDaysPerWeek: 3,
      completedDates: ['2026-11-15'], // completed off-schedule on Sunday
      bestStreakDays: 4,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
  ];
  // Only h_custom_sun is scheduled for Sunday. It is completed -> 1/1 = 100%.
  // h_custom_weekday is off-schedule and does not inflate denominator.
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits,
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  // Active: Focus (35) + Habits (20) = 55. Habit points = round(20 * 1.0 / 55 * 100) = 36 pts.
  assert.equal(score.habitConsistencyPoints, 36);
});

test('Habits — Weekly habits excluded from daily scheduled denominator', () => {
  const habits: Habit[] = [
    {
      id: 'h_weekly',
      userId: 'test_u1',
      title: 'Clean Desk',
      category: 'Organize',
      color: '#f59e0b',
      frequency: 'weekly',
      targetDaysPerWeek: 2,
      completedDates: [],
      bestStreakDays: 1,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    },
  ];
  // Since only weekly habit exists and it is excluded from daily denominator, Habits category is INACTIVE.
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits,
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.details.habitsScheduledToday, 0);
  assert.equal(score.habitConsistencyPoints, 0);
  assert.equal(score.totalScore, 0);
});

test('Study — Active subjects prerequisite: deleted-only subjects make Study INACTIVE', () => {
  const studySubjects: StudySubject[] = [
    {
      id: 'subj_del',
      userId: 'test_u1',
      code: 'Sub_OS',
      name: 'Operating Systems',
      tierId: 't1',
      totalSubtopics: 10,
      completedSubtopics: 5,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
      deletedAt: '2026-11-15T00:00:00Z',
    },
  ];
  const studyPlanTasks: StudyPlanTask[] = [
    {
      id: 'spt_1',
      userId: 'test_u1',
      planId: 'plan_1',
      subjectId: 'subj_del',
      topicId: null,
      title: 'Study Memory Management',
      description: '',
      scheduledDate: '2026-11-15',
      startTime: null,
      endTime: null,
      estimatedMinutes: 45,
      actualMinutes: 45,
      priority: 'high',
      status: 'completed',
      completedAt: '2026-11-15T10:00:00+05:30',
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T10:00:00Z',
      deletedAt: null,
    },
  ];
  // Since all subjects are deleted, Study category is INACTIVE.
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits: [],
    settings: mockSettings,
    studySubjects,
    studyPlanTasks,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.studyActivityPoints, 0);
  assert.equal(score.totalScore, 0);
});

test('Study — 50:50 blend when both Revisions and Plan tasks are active today', () => {
  const OriginalDate = globalThis.Date;
  class MockDate extends OriginalDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super('2026-11-15T10:00:00+05:30');
      } else {
        super(...(args as [string | number | Date]));
      }
    }
    static override now() {
      return new MockDate().getTime();
    }
  }

  try {
    globalThis.Date = MockDate as unknown as DateConstructor;

    const studySubjects: StudySubject[] = [
      {
        id: 'subj_1',
        userId: 'test_u1',
        code: 'Sub_DSA',
        name: 'Algorithms',
        tierId: 't1',
        totalSubtopics: 20,
        completedSubtopics: 10,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        deletedAt: null,
      },
    ];
    // 1 completed revision, 0 pending due -> R_rev = 1.0
    const studyRevisions: StudyRevision[] = [
      {
        id: 'rev_1',
        userId: 'test_u1',
        topicId: 'top_1',
        subjectCode: 'Sub_DSA',
        topicTitle: 'Dynamic Programming',
        lastStudiedAt: '2026-11-15',
        nextRevisionAt: '2026-11-22',
        intervalDays: 7,
        repetition: 2,
        difficulty: 'medium',
        status: 'scheduled',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
        deletedAt: null,
      },
    ];
    // 1 completed of 2 scheduled plan tasks -> R_plan = 0.50
    const studyPlanTasks: StudyPlanTask[] = [
      {
        id: 'spt_1',
        userId: 'test_u1',
        planId: 'p1',
        subjectId: 'subj_1',
        topicId: 'top_1',
        title: 'Practice DP',
        description: '',
        scheduledDate: '2026-11-15',
        startTime: null,
        endTime: null,
        estimatedMinutes: 45,
        actualMinutes: 45,
        priority: 'high',
        status: 'completed',
        completedAt: '2026-11-15T11:00:00+05:30',
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T11:00:00Z',
        deletedAt: null,
      },
      {
        id: 'spt_2',
        userId: 'test_u1',
        planId: 'p1',
        subjectId: 'subj_1',
        topicId: 'top_1',
        title: 'Theory DP',
        description: '',
        scheduledDate: '2026-11-15',
        startTime: null,
        endTime: null,
        estimatedMinutes: 45,
        actualMinutes: 0,
        priority: 'medium',
        status: 'pending',
        completedAt: null,
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
        deletedAt: null,
      },
    ];

    // Study ratio = 0.5 * 1.0 + 0.5 * 0.50 = 0.75
    // Active: Focus (35) + Study (15) = 50.
    // Study points = round(15 * 0.75 / 50 * 100) = 23 pts.
    const score = computeProductivityScore({
      tasks: [],
      sessions: [],
      habits: [],
      settings: mockSettings,
      studySubjects,
      studyRevisions,
      studyPlanTasks,
      referenceDateStr: '2026-11-15',
      timezone: 'Asia/Kolkata',
    });
    assert.equal(score.studyActivityPoints, 23);
    assert.equal(score.totalScore, 23);
  } finally {
    globalThis.Date = OriginalDate;
  }
});

test('Study — Late plan task completion receives 0.25 and 4 tasks cap at 1.0', () => {
  const studySubjects: StudySubject[] = [
    {
      id: 'subj_1',
      userId: 'test_u1',
      code: 'Sub_DSA',
      name: 'Algorithms',
      tierId: 't1',
      totalSubtopics: 20,
      completedSubtopics: 10,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      deletedAt: null,
    },
  ];
  // 4 tasks scheduled for yesterday (2026-11-14) completed today (2026-11-15)
  const studyPlanTasks: StudyPlanTask[] = Array.from({ length: 4 }, (_, i) => ({
    id: `spt_late_${i}`,
    userId: 'test_u1',
    planId: 'p1',
    subjectId: 'subj_1',
    topicId: 'top_1',
    title: `Task ${i}`,
    description: '',
    scheduledDate: '2026-11-14',
    startTime: null,
    endTime: null,
    estimatedMinutes: 45,
    actualMinutes: 45,
    priority: 'high' as const,
    status: 'completed' as const,
    completedAt: '2026-11-15T10:00:00+05:30',
    createdAt: '2026-11-14T00:00:00Z',
    updatedAt: '2026-11-15T10:00:00Z',
    deletedAt: null,
  }));

  // 4 * 0.25 = 1.0 (100% study achievement)
  // Active: Focus (35) + Study (15) = 50.
  // Study points = round(15 * 1.0 / 50 * 100) = 30 pts.
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits: [],
    settings: mockSettings,
    studySubjects,
    studyPlanTasks,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.studyActivityPoints, 30);
  assert.equal(score.totalScore, 30);
});

test('Study — Historical date completely excludes StudyRevision', () => {
  const studySubjects: StudySubject[] = [
    {
      id: 'subj_1',
      userId: 'test_u1',
      code: 'Sub_DSA',
      name: 'Algorithms',
      tierId: 't1',
      totalSubtopics: 20,
      completedSubtopics: 10,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      deletedAt: null,
    },
  ];
  const studyRevisions: StudyRevision[] = [
    {
      id: 'rev_1',
      userId: 'test_u1',
      topicId: 'top_1',
      subjectCode: 'Sub_DSA',
      topicTitle: 'Graph Theory',
      lastStudiedAt: '2026-11-10',
      nextRevisionAt: '2026-11-17',
      intervalDays: 7,
      repetition: 2,
      difficulty: 'medium',
      status: 'scheduled',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-10T00:00:00Z',
      deletedAt: null,
    },
  ];
  // Historical date 2026-11-10. Since revisions are excluded historically and no plan tasks exist,
  // Study category is INACTIVE.
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits: [],
    settings: mockSettings,
    studySubjects,
    studyRevisions,
    studyPlanTasks: [],
    referenceDateStr: '2026-11-10',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.studyActivityPoints, 0);
  assert.equal(score.totalScore, 0);
});

test('Overall — All categories active reaches exact 100 with Mastery tier', () => {
  const studySubjects: StudySubject[] = [
    {
      id: 'subj_1',
      userId: 'test_u1',
      code: 'Sub_DSA',
      name: 'Algorithms',
      tierId: 't1',
      totalSubtopics: 20,
      completedSubtopics: 10,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      deletedAt: null,
    },
  ];
  const sessions: FocusSession[] = [
    {
      id: 'sess_all',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 100,
      durationSeconds: 6000,
      actualDurationSeconds: 6000,
      completed: true,
      status: 'completed',
      startedAt: '2026-11-15T09:00:00+05:30',
      endedAt: '2026-11-15T10:40:00+05:30',
    },
  ];
  const tasks: Task[] = [
    {
      id: 't_all',
      userId: 'test_u1',
      title: 'Full task',
      description: '',
      priority: 'high',
      status: 'completed',
      dueDate: '2026-11-15',
      completedAt: '2026-11-15T11:00:00+05:30',
      estimatedPomodoros: 1,
      completedPomodoros: 1,
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T11:00:00Z',
    },
  ];
  const habits: Habit[] = [
    {
      id: 'h_all',
      userId: 'test_u1',
      title: 'Full habit',
      category: 'Health',
      color: '#3b82f6',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: ['2026-11-15'],
      bestStreakDays: 1,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
  ];
  const studyPlanTasks: StudyPlanTask[] = [
    {
      id: 'spt_all',
      userId: 'test_u1',
      planId: 'p1',
      subjectId: 'subj_1',
      topicId: null,
      title: 'Full plan task',
      description: '',
      scheduledDate: '2026-11-15',
      startTime: null,
      endTime: null,
      estimatedMinutes: 45,
      actualMinutes: 45,
      priority: 'high',
      status: 'completed',
      completedAt: '2026-11-15T12:00:00+05:30',
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T12:00:00Z',
      deletedAt: null,
    },
  ];

  // Active: Focus (35) + Tasks (30) + Habits (20) + Study (15) = 100.
  // All 100% -> Total = 100, Tier = Mastery, tierColor = #10b981
  const score = computeProductivityScore({
    tasks,
    sessions,
    habits,
    settings: mockSettings,
    studySubjects,
    studyPlanTasks,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.focusTimePoints, 35);
  assert.equal(score.taskCompletionPoints, 30);
  assert.equal(score.habitConsistencyPoints, 20);
  assert.equal(score.studyActivityPoints, 15);
  assert.equal(score.targetBonusPoints, 0);
  assert.equal(score.totalScore, 100);
  assert.equal(score.tier, 'Mastery');
  assert.equal(score.tierColor, '#10b981');
  assert.equal(score.details.focusMaxPoints, 35);
  assert.equal(score.details.taskMaxPoints, 30);
  assert.equal(score.details.habitMaxPoints, 20);
  assert.equal(score.details.studyMaxPoints, 15);
});

test('Focus — Paused and resumed Pomodoro that finishes (completed: true, interrupted: true) still earns points', () => {
  const sessions: FocusSession[] = [
    {
      id: 'sess_paused_then_completed',
      userId: 'test_u1',
      taskId: null,
      mode: 'work',
      durationMinutes: 25,
      durationSeconds: 1500,
      actualDurationSeconds: 1500,
      completed: true,
      status: 'completed',
      interrupted: true,
      startedAt: '2026-11-15T09:00:00+05:30',
      endedAt: '2026-11-15T09:27:00+05:30',
    },
  ];
  const score = computeProductivityScore({
    tasks: [],
    sessions,
    habits: [],
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.details.focusMinutesLogged, 25);
  assert.equal(score.details.focusMaxPoints, 100);
  assert.equal(score.focusTimePoints, 25);
  assert.equal(score.totalScore, 25);
});

test('Habits — Weekly habit completed today counts toward Habit Consistency', () => {
  const habits: Habit[] = [
    {
      id: 'h_weekly_done',
      userId: 'test_u1',
      title: 'Weekly Review',
      category: 'Organize',
      color: '#f59e0b',
      frequency: 'weekly',
      targetDaysPerWeek: 1,
      completedDates: ['2026-11-15'],
      bestStreakDays: 1,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    },
  ];
  const score = computeProductivityScore({
    tasks: [],
    sessions: [],
    habits,
    settings: mockSettings,
    referenceDateStr: '2026-11-15',
    timezone: 'Asia/Kolkata',
  });
  assert.equal(score.details.habitsScheduledToday, 1);
  assert.equal(score.details.habitsCompletedToday, 1);
  assert.ok(score.habitConsistencyPoints > 0);
  assert.equal(score.habitConsistencyPoints, score.details.habitMaxPoints);
});
