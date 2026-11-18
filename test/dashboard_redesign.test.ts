import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildExamPrepSnapshot,
  buildRecentActivityFeed,
  buildTodaysPriorities,
  computeDashboardGridSpans,
  DASHBOARD_DEFAULT_ORDER,
  DASHBOARD_LAYOUT_PRESETS,
  formatMinuteOfDay,
  normalizeDashboardLayout,
} from '../src/lib/dashboardIntelligence.ts';
import { handleGuestLocalFallback } from '../src/lib/guestLocalStore.ts';
import type {
  AuditLogEntry,
  Bill,
  DashboardLayoutPreset,
  DashboardWidgetId,
  FocusSession,
  StudyExam,
  StudyMistake,
  StudyRevision,
  StudySubject,
  StudyTopic,
  Task,
  TimeBlock,
} from '../src/types/index.ts';

describe('Dashboard 2.0 Layout Presets & Balanced 12-Col Packing', () => {
  it('defines 4 meaningfully distinct layout presets with zero orphaned 6-col desktop rows', () => {
    const presetKeys = Object.keys(DASHBOARD_LAYOUT_PRESETS) as DashboardLayoutPreset[];
    assert.deepEqual(presetKeys.sort(), ['executive', 'finance_pulse', 'focus_first', 'minimal']);

    const signatures = new Set<string>();

    for (const key of presetKeys) {
      const cfg = DASHBOARD_LAYOUT_PRESETS[key].config;
      const visible = cfg.widgetOrder.filter((id) => !cfg.hiddenWidgets.includes(id));
      assert.ok(visible.length > 0, `Preset ${key} must show at least one widget`);
      signatures.add(visible.join(','));

      const spans = computeDashboardGridSpans(visible, cfg.widgetSizes);

      // Walk the visible widgets and verify every row sums cleanly to 12 columns
      let rowCols = 0;
      for (const id of visible) {
        const cols = spans[id] === 'lg:col-span-6' ? 6 : 12;
        if (cols === 12) {
          assert.equal(
            rowCols,
            0,
            `Preset ${key}: widget ${id} (12 cols) started after an incomplete 6-col row`
          );
        } else {
          rowCols += 6;
          if (rowCols === 12) rowCols = 0;
        }
      }
      assert.equal(rowCols, 0, `Preset ${key} ended with an orphaned 6-col gap`);
    }

    assert.equal(signatures.size, 4, 'All 4 presets must produce distinct visible layouts');
    assert.equal(DASHBOARD_LAYOUT_PRESETS.executive.label, 'Executive Balanced');
    assert.equal(DASHBOARD_LAYOUT_PRESETS.focus_first.label, 'Focus First');
    assert.equal(DASHBOARD_LAYOUT_PRESETS.finance_pulse.label, 'Finance Pulse');
    assert.equal(DASHBOARD_LAYOUT_PRESETS.minimal.label, 'Minimal Brief');
  });

  it('supports widget customization (hide/show, reorder, width override) without breaking 12-col balance', () => {
    const base = normalizeDashboardLayout(DASHBOARD_LAYOUT_PRESETS.executive.config);
    // Simulate user hiding study_pulse, moving finance_kpis up, and making upcoming_bills wide
    const customized = normalizeDashboardLayout({
      ...base,
      widgetOrder: [
        'clock_greeting',
        'finance_kpis',
        'focus_kpis',
        'todays_priorities',
        'study_pulse',
        'upcoming_bills',
        'recent_transactions',
        'productivity_goals',
        'gamification',
        'hero',
      ],
      hiddenWidgets: ['study_pulse', 'hero'],
      widgetSizes: {
        ...base.widgetSizes,
        upcoming_bills: 'wide',
        recent_transactions: 'compact',
      },
    });

    const visible = customized.widgetOrder.filter((id) => !customized.hiddenWidgets.includes(id));
    assert.ok(!visible.includes('study_pulse'));
    assert.ok(!visible.includes('hero'));
    assert.equal(visible[1], 'finance_kpis');

    const spans = computeDashboardGridSpans(visible, customized.widgetSizes);
    // Because study_pulse is hidden, todays_priorities is promoted to full 12 cols
    assert.equal(spans.todays_priorities, 'lg:col-span-12');
    // Because upcoming_bills was resized to wide, recent_transactions (compact) is alone and promoted to 12 cols
    assert.equal(spans.upcoming_bills, 'lg:col-span-12');
    assert.equal(spans.recent_transactions, 'lg:col-span-12');
  });

  it('auto-promotes a lone 6-column widget to 12 columns when its partner is hidden', () => {
    const visible: DashboardWidgetId[] = [
      'clock_greeting',
      'focus_kpis',
      'todays_priorities', // compact by default, but study_pulse is hidden!
      'productivity_goals', // wide (12 cols)
      'upcoming_bills', // compact by default, paired with recent_transactions
      'recent_transactions', // compact by default
    ];
    const spans = computeDashboardGridSpans(visible, {
      todays_priorities: 'compact',
      upcoming_bills: 'compact',
      recent_transactions: 'compact',
    });

    assert.equal(spans.todays_priorities, 'lg:col-span-12');
    assert.equal(spans.upcoming_bills, 'lg:col-span-6');
    assert.equal(spans.recent_transactions, 'lg:col-span-6');
  });

  it('preserves pre-2.0 saved layouts and inserts todays_priorities seamlessly before study_pulse', () => {
    const legacySaved = {
      preset: 'executive' as const,
      widgetOrder: [
        'clock_greeting',
        'hero',
        'study_pulse',
        'focus_kpis',
        'finance_kpis',
        'productivity_goals',
        'gamification',
        'upcoming_bills',
        'recent_transactions',
      ] as DashboardWidgetId[],
      hiddenWidgets: ['hero'] as DashboardWidgetId[],
      widgetSizes: { study_pulse: 'compact' as const },
    };

    const normalized = normalizeDashboardLayout(legacySaved);
    assert.equal(normalized.widgetOrder.length, DASHBOARD_DEFAULT_ORDER.length);
    assert.deepEqual(normalized.hiddenWidgets, ['hero']);

    const prioIdx = normalized.widgetOrder.indexOf('todays_priorities');
    const studyIdx = normalized.widgetOrder.indexOf('study_pulse');
    assert.equal(prioIdx, studyIdx - 1, 'todays_priorities should be inserted right before study_pulse');
  });
});

describe('Dashboard 2.0 Today Priorities & Time Block Aggregation', () => {
  it('prioritizes overdue & high-priority tasks, sorts time blocks, and merges upcoming 7-day events', () => {
    const todayStr = '2026-05-10';
    const tasks: Task[] = [
      {
        id: 't1',
        userId: 'u1',
        title: 'Low future task',
        description: '',
        priority: 'low',
        status: 'todo',
        estimatedPomodoros: 1,
        completedPomodoros: 0,
        dueDate: '2026-05-15',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 't2',
        userId: 'u1',
        title: 'Overdue report',
        description: '',
        priority: 'medium',
        status: 'todo',
        estimatedPomodoros: 2,
        completedPomodoros: 0,
        dueDate: '2026-05-08',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 't3',
        userId: 'u1',
        title: 'Today high priority',
        description: '',
        priority: 'high',
        status: 'in_progress',
        estimatedPomodoros: 3,
        completedPomodoros: 1,
        dueDate: '2026-05-10',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 't4',
        userId: 'u1',
        title: 'Completed task',
        description: '',
        priority: 'high',
        status: 'completed',
        estimatedPomodoros: 1,
        completedPomodoros: 1,
        dueDate: '2026-05-09',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-09T00:00:00Z',
      },
    ];

    const timeBlocks: TimeBlock[] = [
      {
        id: 'tb2',
        userId: 'u1',
        date: todayStr,
        title: 'Afternoon Study',
        startMinute: 840,
        endMinute: 960,
        category: 'study',
        completed: false,
        createdAt: '2026-05-10T00:00:00Z',
        updatedAt: '2026-05-10T00:00:00Z',
      },
      {
        id: 'tb1',
        userId: 'u1',
        date: todayStr,
        title: 'Morning Deep Work',
        startMinute: 540,
        endMinute: 660,
        category: 'focus',
        completed: true,
        createdAt: '2026-05-10T00:00:00Z',
        updatedAt: '2026-05-10T00:00:00Z',
      },
    ];

    const bills: Bill[] = [
      {
        id: 'b1',
        userId: 'u1',
        recurringExpenseId: null,
        name: 'Internet Fiber',
        amountPaise: 99900,
        categoryId: 'cat1',
        categoryName: 'Utilities',
        dueDate: '2026-05-12',
        status: 'UNPAID',
        paymentDate: null,
        notes: '',
        periodKey: '2026-05',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ];

    const exams: StudyExam[] = [
      {
        id: 'e1',
        userId: 'u1',
        title: 'Operating Systems Midsem',
        examType: 'Midsem',
        examDate: '2026-05-14',
        startTime: '10:00',
        durationMinutes: 120,
        totalMarks: 50,
        obtainedMarks: null,
        subjectIds: ['OS'],
        syllabusTopicIds: [],
        preparationStatus: 'preparing',
        resultStatus: 'pending',
        notes: '',
        deletedAt: null,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ];

    const snap = buildTodaysPriorities({
      tasks,
      timeBlocks,
      bills,
      exams,
      revisions: [],
      todayStr,
    });

    assert.equal(snap.totalPendingTasks, 3);
    assert.deepEqual(
      snap.pendingTasks.map((t) => t.id),
      ['t2', 't3', 't1']
    );
    assert.deepEqual(
      snap.todayTimeBlocks.map((tb) => tb.id),
      ['tb1', 'tb2']
    );
    assert.equal(formatMinuteOfDay(540), '9:00 AM');
    assert.equal(formatMinuteOfDay(840), '2:00 PM');
    assert.equal(snap.overdueItems.length, 1);
    assert.equal(snap.overdueItems[0].title, 'Overdue report');
    assert.ok(snap.upcomingEvents.some((e) => e.kind === 'bill' && e.title === 'Internet Fiber'));
    assert.ok(snap.upcomingEvents.some((e) => e.kind === 'exam' && e.title === 'Operating Systems Midsem'));
  });
});

describe('Dashboard 2.0 Exam Prep & Recent Activity Snapshots', () => {
  it('computes nearest upcoming exam countdown, syllabus coverage, and revision completion', () => {
    const todayStr = '2026-05-10';
    const subjects: StudySubject[] = [
      {
        id: 's1',
        userId: 'u1',
        code: 'OS',
        name: 'Operating Systems',
        tierId: 'core',
        totalSubtopics: 2,
        completedSubtopics: 1,
        color: '#f59e0b',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const topics: StudyTopic[] = [
      {
        id: 'top1',
        userId: 'u1',
        subjectCode: 'OS',
        unit: 'Unit 1',
        topic: 'CPU Scheduling',
        subtopic: 'Round Robin',
        priority: 'High',
        theory: true,
        practice: true,
        pyq: true,
        revisionCount: 2,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'top2',
        userId: 'u1',
        subjectCode: 'OS',
        unit: 'Unit 2',
        topic: 'Deadlocks',
        subtopic: 'Banker Algorithm',
        priority: 'High',
        theory: true,
        practice: false,
        pyq: false,
        revisionCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const exams: StudyExam[] = [
      {
        id: 'past-exam',
        userId: 'u1',
        title: 'Past Quiz',
        examType: 'Quiz',
        examDate: '2026-05-01',
        startTime: '09:00',
        durationMinutes: 60,
        totalMarks: 20,
        obtainedMarks: 18,
        subjectIds: ['OS'],
        syllabusTopicIds: ['top1'],
        preparationStatus: 'completed',
        resultStatus: 'published',
        notes: '',
        deletedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 'next-exam',
        userId: 'u1',
        title: 'GATE CS Mock 1',
        examType: 'Mock',
        examDate: '2026-05-20',
        startTime: '14:00',
        durationMinutes: 180,
        totalMarks: 100,
        obtainedMarks: null,
        subjectIds: ['OS'],
        syllabusTopicIds: ['top1', 'top2'],
        preparationStatus: 'preparing',
        resultStatus: 'pending',
        notes: '',
        deletedAt: null,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ];
    const revisions: StudyRevision[] = [
      {
        id: 'r1',
        userId: 'u1',
        topicId: 'top1',
        topicTitle: 'CPU Scheduling',
        subjectCode: 'OS',
        lastStudiedAt: '2026-05-01',
        nextRevisionAt: '2026-05-15',
        intervalDays: 14,
        repetition: 3,
        difficulty: 'easy',
        status: 'mastered',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
      {
        id: 'r2',
        userId: 'u1',
        topicId: 'top2',
        topicTitle: 'Deadlocks',
        subjectCode: 'OS',
        lastStudiedAt: '2026-05-08',
        nextRevisionAt: '2026-05-10',
        intervalDays: 1,
        repetition: 1,
        difficulty: 'hard',
        status: 'due',
        createdAt: '2026-05-08T00:00:00Z',
        updatedAt: '2026-05-08T00:00:00Z',
      },
    ];
    const mistakes: StudyMistake[] = [];

    const snap = buildExamPrepSnapshot({
      exams,
      subjects,
      topics,
      revisions,
      mistakes,
      todayStr,
    });

    assert.ok(snap.nextExam);
    assert.equal(snap.nextExam.exam.id, 'next-exam');
    assert.equal(snap.nextExam.daysRemaining, 10);
    assert.equal(snap.nextExam.readinessPct, 50);
    assert.equal(snap.upcomingExamsCount, 1);
    assert.equal(snap.revisionCompletionPct, 50);
    assert.equal(snap.topSubjects.length, 1);
    assert.equal(snap.topSubjects[0].completionPct, 50);
  });

  it('builds chronological recent activity from real audit logs and focus sessions', () => {
    const logs: AuditLogEntry[] = [
      {
        id: 'log1',
        userId: 'u1',
        action: 'pay',
        entityType: 'bill',
        entityId: 'b1',
        entityTitle: 'Electricity Bill',
        timestamp: '2026-05-10T10:00:00Z',
      },
    ];
    const sessions: FocusSession[] = [
      {
        id: 'fs1',
        userId: 'u1',
        taskId: null,
        taskTitle: 'OS Scheduling Practice',
        mode: 'work',
        durationMinutes: 25,
        durationSeconds: 1500,
        actualDurationSeconds: 1500,
        completed: true,
        startedAt: '2026-05-10T11:00:00Z',
        endedAt: '2026-05-10T11:25:00Z',
      },
    ];

    const feed = buildRecentActivityFeed({
      auditLogs: logs,
      focusSessions: sessions,
      tasks: [],
      limit: 5,
    });

    assert.equal(feed.length, 2);
    assert.equal(feed[0].kind, 'focus');
    assert.equal(feed[0].title, 'Completed 25m Focus');
    assert.equal(feed[1].kind, 'finance');
    assert.equal(feed[1].title, 'Paid Electricity Bill');
  });

  it('serves clean local guest data on production 401 while keeping joint-vaults strictly auth-gated', () => {
    const sid = 'gst_test_production_401';
    const dash = handleGuestLocalFallback(sid, '/dashboard') as Record<string, unknown>;
    assert.ok(dash && typeof dash.todayFocusMinutes === 'number');
    assert.ok(Array.isArray(dash.upcomingPayments));

    const summary = handleGuestLocalFallback(sid, '/finance/summary?filter=this_month') as Record<string, unknown>;
    assert.ok(summary && typeof summary.totalIncomePaise === 'number');
    assert.ok(Array.isArray(summary.categoryBreakdown));

    const habits = handleGuestLocalFallback(sid, '/habits');
    assert.ok(Array.isArray(habits));

    const blocks = handleGuestLocalFallback(sid, '/time-blocks?date=2026-05-10');
    assert.ok(Array.isArray(blocks));

    // Joint Vaults MUST NEVER fall back to guest local store
    const vaultAttempt = handleGuestLocalFallback(sid, '/joint-vaults');
    assert.equal(vaultAttempt, undefined);
  });

  it('enforces dashboard card overflow safeguards across CSS, Financial KPIs, Score Card, and Gamification', () => {
    const root = process.cwd();
    const themesCss = fs.readFileSync(path.join(root, 'src/styles/themes.css'), 'utf-8');
    const scoreCardSrc = fs.readFileSync(
      path.join(root, 'src/components/focus/ProductivityScoreCard.tsx'),
      'utf-8'
    );
    const gamificationSrc = fs.readFileSync(
      path.join(root, 'src/components/dashboard/GamificationCard.tsx'),
      'utf-8'
    );
    const dashboardSrc = fs.readFileSync(
      path.join(root, 'src/components/dashboard/UnifiedDashboard.tsx'),
      'utf-8'
    );

    // 1. Global .ff-card CSS safeguards without global overflow: hidden
    const ffCardBlock = themesCss.slice(
      themesCss.indexOf('.ff-card {'),
      themesCss.indexOf('.ff-card-compact {')
    );
    assert.match(ffCardBlock, /box-sizing:\s*border-box/);
    assert.match(ffCardBlock, /min-width:\s*0/);
    assert.match(ffCardBlock, /overflow-wrap:\s*break-word/);
    assert.doesNotMatch(ffCardBlock, /overflow:\s*hidden/);

    // 2. ProductivityScoreCard wraps tier badge + real-time label cleanly and does not clip card body
    assert.doesNotMatch(scoreCardSrc, /<ThemeCard[^>]*overflow-hidden/);
    assert.match(scoreCardSrc, /flex flex-wrap items-center justify-between gap-x-3 gap-y-1\.5/);
    assert.match(scoreCardSrc, /Updated in real-time/);

    // 3. GamificationCard never truncates challenge or badge titles
    assert.doesNotMatch(gamificationSrc, /ch\.title[\s\S]{0,10}truncate|truncate[^>]*>\s*\{ch\.title\}/);
    assert.doesNotMatch(gamificationSrc, /truncate[^>]*>\s*\{b\.title\}/);
    assert.match(gamificationSrc, /whitespace-normal break-words leading-snug/);
    assert.match(gamificationSrc, /title=\{`\$\{b\.title\}: \$\{b\.description\}/);

    // 4. Financial KPI cards use responsive min-height and multi-line wrapping instead of truncate
    assert.match(dashboardSrc, /min-h-\[138px\] p-4 sm:p-5 flex flex-col justify-between/);
    assert.match(dashboardSrc, /Today's Inflow/);
    assert.match(dashboardSrc, /Today's Outflow/);
    assert.match(dashboardSrc, /Today's Net Cashflow/);
    assert.match(dashboardSrc, /Bills Pending/);
  });
});
