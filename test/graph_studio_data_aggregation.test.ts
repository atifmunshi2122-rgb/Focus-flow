import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateStudyActivityHeatmap,
  aggregateSubjectStudyHours,
  aggregateStudyTrends,
  aggregateSyllabusTriadProgress,
  aggregateSubjectPerformance,
  aggregateSavingsGrowth,
  aggregateBudgetVsActual,
  aggregateMonthlyCashflow,
  aggregateCategorySpending,
  aggregateNetWorthLiquidTimeline,
  aggregateFocusHoursTrend,
  aggregateCircadianHourlyFocus,
  aggregateTaskCompletionTrend,
  aggregateTaskBurndown,
  aggregateEstimatedVsActualFocus,
  aggregateHabitCompletionTrends,
  calculatePearsonCorrelation,
  aggregateFocusVsSpendCorrelation,
} from '../src/components/graph-studio/core/graphDataAggregator.ts';
import {
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  BudgetEnvelope,
  SavingsGoal,
  Task,
  Habit,
} from '../src/types/index.ts';
import {
  StudySubject,
  StudyTopic,
  StudyExam,
  StudyRevision,
  StudyActivityLog,
} from '../src/types/study.ts';

describe('Advanced Graph Studio Data Aggregation Suite', () => {
  const USER_A = 'usr_tenant_alpha';
  const USER_B = 'usr_tenant_beta';

  function mockSession(
    overrides: Partial<FocusSession> & { id: string; userId: string; mode: FocusSession['mode']; startedAt: string }
  ): FocusSession {
    return {
      taskId: null,
      durationMinutes: 25,
      durationSeconds: 1500,
      completed: true,
      status: 'completed',
      endedAt: null,
      createdAt: overrides.startedAt,
      ...overrides,
    };
  }

  function mockExpense(
    overrides: Partial<ExpenseTransaction> & { id: string; userId: string; amountPaise: number; date: string }
  ): ExpenseTransaction {
    return {
      billId: null,
      type: 'variable',
      description: 'Test expense',
      categoryId: 'cat_gen',
      notes: '',
      paymentMethod: 'upi_bank',
      createdAt: overrides.date,
      ...overrides,
    };
  }

  function mockTask(overrides: Partial<Task> & { id: string; userId: string; title: string }): Task {
    return {
      description: '',
      priority: 'medium',
      status: 'todo',
      estimatedPomodoros: 2,
      completedPomodoros: 0,
      dueDate: null,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      ...overrides,
    };
  }

  function mockSubject(overrides: Partial<StudySubject> & { id: string; userId: string; code: string; name: string }): StudySubject {
    return {
      tierId: 'tier1',
      totalSubtopics: 10,
      completedSubtopics: 5,
      color: '#6366f1',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      ...overrides,
    };
  }

  // ==========================================================================
  // 1. TENANT ISOLATION & DELETED RECORD FILTERING
  // ==========================================================================
  describe('1. Multi-Tenant Security & Soft-Delete Enforcement', () => {
    it('strictly isolates focus sessions by activeUserId and excludes deleted/incomplete records', () => {
      const s3Deleted = mockSession({
        id: 's3_deleted',
        userId: USER_A,
        mode: 'work',
        durationMinutes: 60,
        durationSeconds: 3600,
        startedAt: '2026-11-20T13:00:00.000Z',
      });
      (s3Deleted as unknown as { deletedAt: string }).deletedAt = '2026-11-20T15:00:00.000Z';

      const sessions: FocusSession[] = [
        mockSession({
          id: 's1',
          userId: USER_A,
          mode: 'work',
          durationMinutes: 50,
          durationSeconds: 3000,
          startedAt: '2026-11-20T10:00:00.000Z',
        }),
        mockSession({
          id: 's2_cross_tenant',
          userId: USER_B,
          mode: 'work',
          durationMinutes: 90,
          durationSeconds: 5400,
          startedAt: '2026-11-20T11:00:00.000Z',
        }),
        s3Deleted,
        mockSession({
          id: 's4_break',
          userId: USER_A,
          mode: 'short_break',
          durationMinutes: 10,
          durationSeconds: 600,
          startedAt: '2026-11-20T14:00:00.000Z',
        }),
      ];

      const res = aggregateFocusHoursTrend(sessions, '2026-11-19', '2026-11-21', 'Asia/Kolkata', USER_A);
      const dayData = res.days.find((d) => d.date === '2026-11-20');

      assert.ok(dayData, 'Should have day entry for 2026-11-20');
      // Only s1 should count (50 mins). s2 is USER_B, s3 is deletedAt, s4 is short_break.
      assert.strictEqual(dayData.minutes, 50);
      assert.strictEqual(dayData.hours, 0.8);
      assert.strictEqual(dayData.sessionsCount, 1);
    });

    it('strictly isolates transactions by activeUserId and filters deleted financial records', () => {
      const incomes: IncomeTransaction[] = [
        {
          id: 'inc1',
          userId: USER_A,
          source: 'Salary',
          amountPaise: 5000000,
          date: '2026-11-01',
          category: 'Salary',
          notes: '',
          createdAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 'inc2_tenant_b',
          userId: USER_B,
          source: 'Consulting',
          amountPaise: 9000000,
          date: '2026-11-02',
          category: 'Consulting',
          notes: '',
          createdAt: '2026-11-02T00:00:00Z',
        },
        {
          id: 'inc3_deleted',
          userId: USER_A,
          source: 'Dividend',
          amountPaise: 1000000,
          date: '2026-11-03',
          category: 'Investment',
          notes: '',
          deletedAt: '2026-11-03T10:00:00Z',
          createdAt: '2026-11-03T00:00:00Z',
        },
      ];

      const expenses: ExpenseTransaction[] = [
        mockExpense({
          id: 'exp1',
          userId: USER_A,
          description: 'Groceries',
          amountPaise: 1500000,
          date: '2026-11-05',
          categoryId: 'cat_groceries',
          categoryName: 'Groceries',
          paymentMethod: 'upi_bank',
        }),
        mockExpense({
          id: 'exp2_deleted',
          userId: USER_A,
          type: 'fixed',
          description: 'Internet',
          amountPaise: 100000,
          date: '2026-11-06',
          categoryId: 'cat_utilities',
          categoryName: 'Utilities',
          paymentMethod: 'other',
          deletedAt: '2026-11-06T10:00:00Z',
        }),
      ];

      const cashflow = aggregateMonthlyCashflow(incomes, expenses, 6, USER_A);
      const novBucket = cashflow.months.find((m) => m.month === '2026-11');

      assert.ok(novBucket, 'Should find 2026-11 bucket');
      assert.strictEqual(novBucket.incomePaise, 5000000, 'Inflow must be exactly inc1 (5000000)');
      assert.strictEqual(novBucket.expensePaise, 1500000, 'Outflow must be exactly exp1 (1500000)');
      assert.strictEqual(novBucket.netPaise, 3500000, 'Net flow must be 3500000');
    });
  });

  // ==========================================================================
  // 2. STUDY OS DOMAIN AGGREGATIONS
  // ==========================================================================
  describe('2. Study OS Intelligence Aggregations', () => {
    const mockSubjects: StudySubject[] = [
      mockSubject({
        id: 'sub_algo',
        userId: USER_A,
        code: 'CS101',
        name: 'Algorithms',
        color: '#6366f1',
      }),
      mockSubject({
        id: 'sub_dbms',
        userId: USER_A,
        code: 'CS102',
        name: 'Database Systems',
        color: '#10b981',
      }),
    ];

    it('aggregates study activity heatmap combining focus sessions and activity logs', () => {
      const sessions: FocusSession[] = [
        mockSession({
          id: 's_study1',
          userId: USER_A,
          mode: 'work',
          durationMinutes: 60,
          durationSeconds: 3600,
          startedAt: '2026-11-22T08:00:00.000Z',
        }),
      ];

      const logs: StudyActivityLog[] = [
        {
          id: 'log1',
          userId: USER_A,
          activityType: 'topic_completed',
          subjectId: 'sub_algo',
          topicId: 't1',
          planId: null,
          taskId: null,
          description: 'Completed Dynamic Programming',
          metadata: {},
          activityDate: '2026-11-22',
          createdAt: '2026-11-22T10:00:00.000Z',
        },
      ];

      const heatmap = aggregateStudyActivityHeatmap(sessions, logs, '2026-11-21', '2026-11-23', 'Asia/Kolkata', USER_A);
      assert.strictEqual(heatmap.totalMinutes, 60);

      const targetDay = heatmap.cells.find((d) => d.date === '2026-11-22');
      assert.ok(targetDay);
      assert.strictEqual(targetDay.minutes, 60);
      assert.strictEqual(targetDay.sessionsCount, 1);
    });

    it('aggregates subject-wise study hours allocating registered subjects properly', () => {
      const sessions: FocusSession[] = [
        mockSession({
          id: 's1',
          userId: USER_A,
          mode: 'work',
          subjectCode: 'CS101',
          durationMinutes: 120,
          durationSeconds: 7200,
          startedAt: '2026-11-20T10:00:00Z',
        }),
        mockSession({
          id: 's2',
          userId: USER_A,
          mode: 'work',
          subjectCode: 'CS102',
          durationMinutes: 30,
          durationSeconds: 1800,
          startedAt: '2026-11-20T14:00:00Z',
        }),
      ];

      const res = aggregateSubjectStudyHours(sessions, mockSubjects, USER_A);
      assert.strictEqual(res.totalMinutes, 150);

      const cs101 = res.list.find((b) => b.subjectCode === 'CS101');
      assert.ok(cs101);
      assert.strictEqual(cs101.minutes, 120);
      assert.strictEqual(cs101.hours, '2.0');

      const cs102 = res.list.find((b) => b.subjectCode === 'CS102');
      assert.ok(cs102);
      assert.strictEqual(cs102.minutes, 30);
    });

    it('aggregates syllabus triad completion correctly', () => {
      const topics: StudyTopic[] = [
        {
          id: 't1',
          userId: USER_A,
          subjectCode: 'CS101',
          unit: 'Unit 1',
          topic: 'Divide and Conquer',
          subtopic: 'Merge Sort',
          priority: 'High',
          theory: true,
          practice: true,
          pyq: true,
          revisionCount: 1,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 't2',
          userId: USER_A,
          subjectCode: 'CS101',
          unit: 'Unit 2',
          topic: 'Dynamic Programming',
          subtopic: 'Knapsack',
          priority: 'High',
          theory: true,
          practice: false,
          pyq: false,
          revisionCount: 0,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 't3_deleted',
          userId: USER_A,
          subjectCode: 'CS101',
          unit: 'Unit 3',
          topic: 'Greedy Algorithms',
          subtopic: 'Huffman',
          priority: 'Medium',
          theory: true,
          practice: true,
          pyq: true,
          revisionCount: 1,
          deletedAt: '2026-10-15T00:00:00Z',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ];

      const triad = aggregateSyllabusTriadProgress(mockSubjects, topics, USER_A);
      const algo = triad.find((s) => s.code === 'CS101');

      assert.ok(algo);
      assert.strictEqual(algo.totalTopics, 2, 'Must exclude deleted topic t3');
      assert.strictEqual(algo.theoryPct, 100); // 2 of 2 = 100%
      assert.strictEqual(algo.practicePct, 50); // 1 of 2 = 50%
      assert.strictEqual(algo.pyqPct, 50); // 1 of 2 = 50%
      assert.strictEqual(algo.readinessIndex, 67); // round((100+50+50)/3) = 67
    });

    it('enforces STRICT GATING for Subject Score Comparison: zero data if no verified scores exist', () => {
      // Test A: zero exams, zero revisions -> empty result
      const emptyResult = aggregateSubjectPerformance([], [], mockSubjects, USER_A);
      assert.deepStrictEqual(emptyResult, [], 'Must return empty array when no scores exist');

      // Test B: exam with obtainedMarks published
      const exams: StudyExam[] = [
        {
          id: 'ex1',
          userId: USER_A,
          title: 'Midterm Exam',
          examType: 'midterm',
          examDate: '2026-10-15',
          startTime: null,
          durationMinutes: 180,
          totalMarks: 100,
          obtainedMarks: 85,
          subjectIds: ['sub_algo'],
          syllabusTopicIds: [],
          preparationStatus: 'completed',
          resultStatus: 'published',
          notes: '',
          deletedAt: null,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-16T00:00:00Z',
        },
      ];

      const revisions: StudyRevision[] = [
        {
          id: 'rev1',
          userId: USER_A,
          subjectCode: 'CS101',
          topicId: 't1',
          topicTitle: 'Divide and Conquer',
          lastStudiedAt: '2026-10-15',
          nextRevisionAt: '2026-10-18',
          intervalDays: 3,
          repetition: 2,
          difficulty: 'medium',
          recallScore: 90,
          status: 'mastered',
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-16T00:00:00Z',
        },
      ];

      const scored = aggregateSubjectPerformance(exams, revisions, mockSubjects, USER_A);
      assert.strictEqual(scored.length, 1);
      assert.strictEqual(scored[0].subjectCode, 'CS101');
      assert.strictEqual(scored[0].examAvgPct, 85);
      assert.strictEqual(scored[0].revisionRecallAvg, 90);
      assert.strictEqual(scored[0].overallScore, 88); // round((85 + 90)/2) = 88
    });
  });

  // ==========================================================================
  // 3. FINANCE DOMAIN AGGREGATIONS
  // ==========================================================================
  describe('3. Finance Intelligence Aggregations', () => {
    it('aggregates budget vs actual spending accurately by envelope category', () => {
      const envelopes: BudgetEnvelope[] = [
        {
          id: 'env_food',
          userId: USER_A,
          name: 'Food & Dining',
          allocatedPaise: 2000000, // Rs 20,000
          monthKey: '2026-11',
          categoryId: 'cat_food',
          color: '#10b981',
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ];

      const expenses: ExpenseTransaction[] = [
        mockExpense({
          id: 'e1',
          userId: USER_A,
          description: 'Supermarket',
          amountPaise: 800000,
          date: '2026-11-10',
          categoryId: 'cat_food',
          categoryName: 'Food & Dining',
        }),
        mockExpense({
          id: 'e2',
          userId: USER_A,
          description: 'Restaurant',
          amountPaise: 700000,
          date: '2026-11-15',
          categoryId: 'cat_food',
          categoryName: 'Food & Dining',
          paymentMethod: 'credit_card',
        }),
      ];

      const res = aggregateBudgetVsActual(envelopes, expenses, '2026-11', USER_A);
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].allocatedPaise, 2000000);
      assert.strictEqual(res[0].spentPaise, 1500000);
      assert.strictEqual(res[0].burnPct, 75);
      assert.strictEqual(res[0].tone, 'success');
    });

    it('aggregates savings growth goals and handles 0 target division safely', () => {
      const goals: SavingsGoal[] = [
        {
          id: 'g1',
          userId: USER_A,
          title: 'Emergency Reserve',
          targetPaise: 10000000,
          savedPaise: 7500000,
          color: '#10b981',
          targetDate: '2026-12-31',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 'g2_zero_target',
          userId: USER_A,
          title: 'Uncapped Buffer',
          targetPaise: 0,
          savedPaise: 500000,
          color: '#6366f1',
          targetDate: '2026-12-31',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-11-01T00:00:00Z',
        },
      ];

      const res = aggregateSavingsGrowth(goals, USER_A);
      assert.strictEqual(res.goals.length, 2);
      assert.strictEqual(res.goals[0].progressPct, 75);
      assert.strictEqual(res.goals[1].progressPct, 0, 'Zero target goal must return 0% without NaN');
      assert.strictEqual(res.totalSavedPaise, 8000000);
    });

    it('generates liquid operating timeline with institutional balance sheet disclaimer', () => {
      const incomes: IncomeTransaction[] = [
        {
          id: 'i1',
          userId: USER_A,
          source: 'Initial Float',
          amountPaise: 1000000,
          date: '2026-11-01',
          category: 'Float',
          notes: '',
          createdAt: '2026-11-01T00:00:00Z',
        },
      ];
      const expenses: ExpenseTransaction[] = [
        mockExpense({
          id: 'e1',
          userId: USER_A,
          description: 'Stationery',
          amountPaise: 200000,
          date: '2026-11-03',
          categoryId: 'cat_office',
          paymentMethod: 'cash',
        }),
      ];

      const timeline = aggregateNetWorthLiquidTimeline(incomes, expenses, USER_A);
      assert.ok(timeline.disclaimer.includes('Liquid Operating Ledger Only'));
      assert.strictEqual(timeline.currentLiquidPaise, 800000);
      assert.strictEqual(timeline.points.length, 2);
      assert.strictEqual(timeline.points[0].balancePaise, 1000000);
      assert.strictEqual(timeline.points[1].balancePaise, 800000);
    });
  });

  // ==========================================================================
  // 4. PRODUCTIVITY DOMAIN AGGREGATIONS
  // ==========================================================================
  describe('4. Productivity & Task Intelligence Aggregations', () => {
    it('aggregates circadian 24-hour focus heatmap in Asia/Kolkata timezone and detects peak hour', () => {
      const sessions: FocusSession[] = [
        // 04:30 UTC = 10:00 AM IST
        mockSession({
          id: 's_morning',
          userId: USER_A,
          mode: 'work',
          durationMinutes: 60,
          durationSeconds: 3600,
          startedAt: '2026-11-20T04:30:00.000Z',
        }),
        // 05:00 UTC = 10:30 AM IST
        mockSession({
          id: 's_morning_2',
          userId: USER_A,
          mode: 'work',
          durationMinutes: 45,
          durationSeconds: 2700,
          startedAt: '2026-11-21T05:00:00.000Z',
        }),
      ];

      const res = aggregateCircadianHourlyFocus(sessions, 'Asia/Kolkata', USER_A);
      assert.strictEqual(res.hours.length, 24);

      // Hour 10 should have 105 mins total
      const hour10 = res.hours[10];
      assert.strictEqual(hour10.minutes, 105);
      assert.strictEqual(hour10.sessionCount, 2);
      assert.strictEqual(hour10.isPeak, true);
      assert.strictEqual(res.peakHour.hour, 10);
    });

    it('aggregates task burndown and completion trend correctly', () => {
      const tasks: Task[] = [
        mockTask({
          id: 't1',
          userId: USER_A,
          title: 'Design UI',
          status: 'completed',
          priority: 'high',
          estimatedPomodoros: 2,
          completedPomodoros: 2,
          completedAt: '2026-11-20T10:00:00Z',
          createdAt: '2026-11-18T00:00:00Z',
          updatedAt: '2026-11-20T10:00:00Z',
        }),
        mockTask({
          id: 't2',
          userId: USER_A,
          title: 'Write Docs',
          status: 'completed',
          priority: 'medium',
          estimatedPomodoros: 3,
          completedPomodoros: 3,
          completedAt: '2026-11-21T12:00:00Z',
          createdAt: '2026-11-19T00:00:00Z',
          updatedAt: '2026-11-21T12:00:00Z',
        }),
        mockTask({
          id: 't3',
          userId: USER_A,
          title: 'Deploy Service',
          status: 'todo',
          priority: 'high',
          estimatedPomodoros: 4,
          completedPomodoros: 0,
          createdAt: '2026-11-19T00:00:00Z',
          updatedAt: '2026-11-19T00:00:00Z',
        }),
      ];

      const trend = aggregateTaskCompletionTrend(tasks, '2026-11-19', '2026-11-22', USER_A);
      assert.strictEqual(trend.totalCompleted, 2);

      const day20 = trend.points.find((p) => p.dateStr === '2026-11-20');
      assert.ok(day20);
      assert.strictEqual(day20.completedCount, 1);
      assert.strictEqual(day20.cumulativeCompleted, 1);

      const day21 = trend.points.find((p) => p.dateStr === '2026-11-21');
      assert.ok(day21);
      assert.strictEqual(day21.completedCount, 1);
      assert.strictEqual(day21.cumulativeCompleted, 2);

      const burndown = aggregateTaskBurndown(tasks, '2026-11-19', '2026-11-22', USER_A);
      assert.strictEqual(burndown.initialBacklog, 3);
      assert.strictEqual(burndown.finalRemaining, 1);
    });

    it('calibrates estimated vs actual focus time and detects planning bias', () => {
      const tasks: Task[] = [
        mockTask({
          id: 't1',
          userId: USER_A,
          title: 'Underestimated Task',
          estimatedPomodoros: 2,
          completedPomodoros: 4,
          status: 'completed',
          priority: 'high',
        }),
        mockTask({
          id: 't2',
          userId: USER_A,
          title: 'Overestimated Task',
          estimatedPomodoros: 5,
          completedPomodoros: 3,
          status: 'completed',
          priority: 'medium',
        }),
        mockTask({
          id: 't3',
          userId: USER_A,
          title: 'Spot-On Task',
          estimatedPomodoros: 3,
          completedPomodoros: 3,
          status: 'completed',
          priority: 'low',
        }),
      ];

      const res = aggregateEstimatedVsActualFocus(tasks, USER_A);
      assert.strictEqual(res.underestimatedCount, 1);
      assert.strictEqual(res.overestimatedCount, 1);
      assert.strictEqual(res.accurateCount, 1);
      assert.strictEqual(res.totalEstimatedPoms, 10);
      assert.strictEqual(res.totalActualPoms, 10);
      assert.strictEqual(res.accuracyRatio, 1);
    });
  });

  // ==========================================================================
  // 5. HABIT DOMAIN AGGREGATIONS
  // ==========================================================================
  describe('5. Habit Intelligence Aggregations', () => {
    it('aggregates weekly and monthly habit completion trends with scheduled frequencies', () => {
      const habits: Habit[] = [
        {
          id: 'h1',
          userId: USER_A,
          title: 'Morning Meditation',
          category: 'Mindfulness',
          color: '#6366f1',
          frequency: 'daily',
          targetDaysPerWeek: 7,
          completedDates: ['2026-11-20', '2026-11-21', '2026-11-22'],
          bestStreakDays: 14,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-11-22T00:00:00Z',
        },
      ];

      const weeklyTrends = aggregateHabitCompletionTrends(habits, 'weekly', USER_A);
      assert.ok(weeklyTrends.length > 0);
      weeklyTrends.forEach((b) => {
        assert.strictEqual(Number.isFinite(b.completionRate), true);
        assert.ok(b.completionRate >= 0 && b.completionRate <= 100);
      });

      const monthlyTrends = aggregateHabitCompletionTrends(habits, 'monthly', USER_A);
      assert.ok(monthlyTrends.length > 0);
    });
  });

  // ==========================================================================
  // 6. STATISTICAL INTEGRITY & PEARSON CORRELATION
  // ==========================================================================
  describe('6. Statistical Integrity & Pearson Correlation', () => {
    it('computes exact Pearson r = 1.0 for perfect positive correlation', () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [2, 4, 6, 8, 10];
      const r = calculatePearsonCorrelation(xs, ys);
      assert.strictEqual(Math.round(r * 100) / 100, 1.0);
    });

    it('computes exact Pearson r = -1.0 for perfect inverse correlation', () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [10, 8, 6, 4, 2];
      const r = calculatePearsonCorrelation(xs, ys);
      assert.strictEqual(Math.round(r * 100) / 100, -1.0);
    });

    it('returns r = 0 safely when variance is zero without NaN', () => {
      const xs = [5, 5, 5, 5];
      const ys = [10, 20, 30, 40];
      const r = calculatePearsonCorrelation(xs, ys);
      assert.strictEqual(r, 0);
    });

    it('aggregates daily focus minutes against discretionary spend with statistical explanation', () => {
      const sessions: FocusSession[] = [
        mockSession({
          id: 's1',
          userId: USER_A,
          mode: 'work',
          durationMinutes: 120,
          durationSeconds: 7200,
          startedAt: '2026-11-20T10:00:00Z',
        }),
        mockSession({
          id: 's2',
          userId: USER_A,
          mode: 'work',
          durationMinutes: 60,
          durationSeconds: 3600,
          startedAt: '2026-11-21T10:00:00Z',
        }),
      ];

      const expenses: ExpenseTransaction[] = [
        mockExpense({
          id: 'e1',
          userId: USER_A,
          description: 'Dining',
          amountPaise: 50000,
          date: '2026-11-20',
          categoryId: 'cat_dining',
          paymentMethod: 'credit_card',
        }),
        mockExpense({
          id: 'e2',
          userId: USER_A,
          description: 'Cinema',
          amountPaise: 100000,
          date: '2026-11-21',
          categoryId: 'cat_entertainment',
          paymentMethod: 'upi_bank',
        }),
      ];

      const res = aggregateFocusVsSpendCorrelation(sessions, expenses, '2026-11-20', '2026-11-21', 'Asia/Kolkata', USER_A);
      assert.strictEqual(res.pairs.length, 2);
      assert.strictEqual(res.pairs[0].focusMinutes, 120);
      assert.strictEqual(res.pairs[0].spendPaise, 50000);
      assert.strictEqual(res.pairs[1].focusMinutes, 60);
      assert.strictEqual(res.pairs[1].spendPaise, 100000);

      assert.strictEqual(Number.isFinite(res.pearsonR), true);
      assert.ok(res.explanation.length > 0);
    });
  });
});
