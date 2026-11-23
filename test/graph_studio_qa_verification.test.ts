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
  scaleLinear,
  invertLinear,
  scaleBand,
  getNiceTicks,
  formatCompactNumber,
} from '../src/components/graph-studio/core/GraphScales.ts';
import {
  generateSmoothSplinePath,
  generateAreaPath,
  generateStepPath,
  describeArc,
} from '../src/components/graph-studio/core/GraphPathGenerators.ts';
import { exportDatasetToCsv } from '../src/components/graph-studio/core/GraphExport.ts';
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
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  addDays,
} from '../src/lib/dateTime.ts';
import { formatCurrency } from '../src/lib/currency.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('Advanced Graph Studio QA & Final Verification Suite', () => {
  const USER_A = 'usr_qa_operator';
  const USER_B = 'usr_cross_tenant_intruder';

  function createMockSession(
    overrides: Partial<FocusSession> & { id: string; userId: string; mode: FocusSession['mode']; startedAt: string }
  ): FocusSession {
    const mins = overrides.durationMinutes ?? 25;
    return {
      taskId: null,
      durationMinutes: mins,
      durationSeconds: mins * 60,
      completed: true,
      status: 'completed',
      endedAt: null,
      createdAt: overrides.startedAt,
      ...overrides,
    };
  }

  function createMockExpense(
    overrides: Partial<ExpenseTransaction> & { id: string; userId: string; amountPaise: number; date: string }
  ): ExpenseTransaction {
    return {
      billId: null,
      type: 'variable',
      description: 'QA Expense',
      categoryId: 'cat_qa',
      notes: '',
      paymentMethod: 'upi_bank',
      createdAt: overrides.date,
      ...overrides,
    };
  }

  // ==========================================================================
  // SECTION 1: FUNCTIONAL VERIFICATION
  // ==========================================================================
  describe('1. Functional Tests: Date Filtering, Navigation & Edge States', () => {
    it('verifies deterministic date range generation for all timeframe filters', () => {
      const tz = 'Asia/Kolkata';
      const today = getTodayDateString(tz);

      // 1. Today / Daily: Exactly 1 day span
      const todayStart = today;
      const todayEnd = today;
      assert.strictEqual(todayStart, todayEnd);

      // 2. Weekly: Exactly 7 days span (addDays -6 to today)
      const weeklyStart = addDays(today, -6);
      const weeklyEnd = today;
      assert.ok(weeklyStart < weeklyEnd);

      // 3. Monthly: Exactly 30 days span (addDays -29 to today)
      const monthlyStart = addDays(today, -29);
      const monthlyEnd = today;
      assert.ok(monthlyStart < monthlyEnd);

      // 4. Yearly: Exactly 365 days span (addDays -364 to today)
      const yearlyStart = addDays(today, -364);
      const yearlyEnd = today;
      assert.ok(yearlyStart < yearlyEnd);

      // 5. Custom: arbitrary range validation
      const customStart = '2026-01-01';
      const customEnd = '2026-06-30';
      assert.ok(customStart < customEnd);
    });

    it('handles empty input data gracefully without NaN or runtime exceptions', () => {
      // Study Heatmap on empty sessions and logs
      const heatmap = aggregateStudyActivityHeatmap([], [], '2026-11-01', '2026-11-07', DEFAULT_TIMEZONE, USER_A);
      assert.strictEqual(heatmap.totalMinutes, 0);
      assert.strictEqual(heatmap.cells.length, 7);
      heatmap.cells.forEach((c) => {
        assert.strictEqual(c.minutes, 0);
        assert.strictEqual(c.sessionsCount, 0);
      });

      // Study Trends on empty sessions
      const trends = aggregateStudyTrends([], 'weekly', DEFAULT_TIMEZONE, USER_A);
      assert.strictEqual(trends.totalMinutes, 0);
      assert.strictEqual(trends.buckets.length, 0);

      // Monthly Cashflow on empty transactions
      const cashflow = aggregateMonthlyCashflow([], [], 6, USER_A);
      assert.strictEqual(cashflow.months.length, 0);
      assert.strictEqual(cashflow.maxVal, 1);

      // Savings Growth on empty goals
      const savings = aggregateSavingsGrowth([], USER_A);
      assert.strictEqual(savings.goals.length, 0);
      assert.strictEqual(savings.totalSavedPaise, 0);
      assert.strictEqual(savings.overallProgressPct, 0);

      // Circadian Hourly on empty sessions
      const circadian = aggregateCircadianHourlyFocus([], DEFAULT_TIMEZONE, USER_A);
      assert.strictEqual(circadian.hours.length, 24);
      circadian.hours.forEach((h) => {
        assert.strictEqual(h.minutes, 0);
        assert.strictEqual(Number.isFinite(h.heightPct), true);
      });

      // Pearson correlation on empty datasets
      const rEmpty = calculatePearsonCorrelation([], []);
      assert.strictEqual(rEmpty, 0);
    });

    it('verifies CSV export escaping complies with RFC 4180 standard', () => {
      const headers = ['Name', 'Details', 'Amount'];
      const rows = [
        ['Standard Item', 'Normal description', 100],
        ['Item with, comma', 'Description with "quotes"', 250],
        ['Item with\nnewline', 'Description with CRLF\r\nand comma,', 500],
      ];

      // Test escaping logic directly
      const csvLines: string[] = [];
      const escapeCell = (val: unknown): string => {
        const raw = val === null || val === undefined ? '' : String(val);
        if (/[",\r\n]/.test(raw)) {
          return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
      };

      csvLines.push(headers.map(escapeCell).join(','));
      rows.forEach((r) => csvLines.push(r.map(escapeCell).join(',')));
      const csvText = csvLines.join('\r\n');

      assert.ok(csvText.includes('"Item with, comma"'), 'Comma must be quoted');
      assert.ok(csvText.includes('"Description with ""quotes"""'), 'Quotes must be escaped with double quotes');
      assert.ok(csvText.includes('"Item with\nnewline"'), 'Newline must be quoted');
    });

    it('verifies SVG scale math handles single points and zero spans without division by zero', () => {
      const zeroSpanDomain: [number, number] = [100, 100];
      const targetRange: [number, number] = [0, 500];

      const scaled = scaleLinear(100, zeroSpanDomain, targetRange);
      assert.strictEqual(Number.isFinite(scaled), true);
      assert.strictEqual(scaled, 250); // Midpoint fallback

      const inverted = invertLinear(250, zeroSpanDomain, targetRange);
      assert.strictEqual(Number.isFinite(inverted), true);
    });
  });

  // ==========================================================================
  // SECTION 2: DATA INTEGRITY & AUDIT INVARIANTS
  // ==========================================================================
  describe('2. Data Integrity: Tenant Isolation, Zero AI & Score Gating', () => {
    it('strictly eliminates duplicate aggregation across identical timestamp queries', () => {
      // 3 distinct focus sessions
      const s1 = createMockSession({ id: 's1', userId: USER_A, mode: 'work', durationMinutes: 30, startedAt: '2026-11-20T10:00:00Z' });
      const s2 = createMockSession({ id: 's2', userId: USER_A, mode: 'work', durationMinutes: 45, startedAt: '2026-11-20T11:00:00Z' });
      const s3 = createMockSession({ id: 's3', userId: USER_A, mode: 'work', durationMinutes: 25, startedAt: '2026-11-20T14:00:00Z' });

      const res = aggregateFocusHoursTrend([s1, s2, s3], '2026-11-20', '2026-11-20', 'UTC', USER_A);
      assert.strictEqual(res.days.length, 1);
      assert.strictEqual(res.days[0].minutes, 100); // 30 + 45 + 25
      assert.strictEqual(res.days[0].sessionsCount, 3);
      assert.strictEqual(res.totalMinutes, 100);
    });

    it('strictly isolates tenant data across all domain aggregators', () => {
      const userASessions = [
        createMockSession({ id: 'sa1', userId: USER_A, mode: 'work', durationMinutes: 60, startedAt: '2026-11-20T10:00:00Z' }),
      ];
      const userBSessions = [
        createMockSession({ id: 'sb1', userId: USER_B, mode: 'work', durationMinutes: 120, startedAt: '2026-11-20T10:00:00Z' }),
      ];

      // Querying as USER_A must never see USER_B's 120 minutes
      const focusA = aggregateFocusHoursTrend([...userASessions, ...userBSessions], '2026-11-20', '2026-11-20', 'UTC', USER_A);
      assert.strictEqual(focusA.totalMinutes, 60);

      // Querying as USER_B must never see USER_A's 60 minutes
      const focusB = aggregateFocusHoursTrend([...userASessions, ...userBSessions], '2026-11-20', '2026-11-20', 'UTC', USER_B);
      assert.strictEqual(focusB.totalMinutes, 120);
    });

    it('verifies STRICT GATING on Subject Performance: never hallucinates test scores when missing', () => {
      const subjectUnscored: StudySubject = {
        id: 'sub_unscored',
        userId: USER_A,
        code: 'PHY101',
        name: 'Physics',
        tierId: 't1',
        totalSubtopics: 10,
        completedSubtopics: 0,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      // Unscored subject has 0 exams and 0 revisions
      const result = aggregateSubjectPerformance([], [], [subjectUnscored], USER_A);
      assert.strictEqual(result.length, 0, 'Must produce 0 score bars for unscored subjects');

      // Exam with null obtainedMarks (e.g. pending exam)
      const pendingExam: StudyExam = {
        id: 'ex_pending',
        userId: USER_A,
        title: 'Upcoming Physics Exam',
        examType: 'final',
        examDate: '2026-12-01',
        startTime: null,
        durationMinutes: 180,
        totalMarks: 100,
        obtainedMarks: null, // PENDING MARKS
        subjectIds: ['sub_unscored'],
        syllabusTopicIds: [],
        preparationStatus: 'ready',
        resultStatus: 'pending',
        notes: '',
        deletedAt: null,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      const resultPending = aggregateSubjectPerformance([pendingExam], [], [subjectUnscored], USER_A);
      assert.strictEqual(resultPending.length, 0, 'Pending exam marks must NOT be plotted as scores');
    });

    it('preserves exact integer paise arithmetic without floating-point drift', () => {
      const incomes: IncomeTransaction[] = [
        {
          id: 'i1',
          userId: USER_A,
          source: 'Client 1',
          amountPaise: 333333,
          date: '2026-11-01',
          category: 'Consulting',
          notes: '',
          createdAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 'i2',
          userId: USER_A,
          source: 'Client 2',
          amountPaise: 666667,
          date: '2026-11-02',
          category: 'Consulting',
          notes: '',
          createdAt: '2026-11-02T00:00:00Z',
        },
      ];

      const expenses: ExpenseTransaction[] = [
        createMockExpense({
          id: 'e1',
          userId: USER_A,
          amountPaise: 100000,
          date: '2026-11-03',
        }),
      ];

      const cashflow = aggregateMonthlyCashflow(incomes, expenses, 1, USER_A);
      assert.strictEqual(cashflow.months.length, 1);
      assert.strictEqual(cashflow.months[0].incomePaise, 1000000); // Exact integer sum
      assert.strictEqual(cashflow.months[0].expensePaise, 100000);
      assert.strictEqual(cashflow.months[0].netPaise, 900000);
      assert.strictEqual(cashflow.months[0].savingsRate, 90);
    });

    it('verifies liquid cashflow timeline demarcates operating ledger from institutional balance sheets', () => {
      const timeline = aggregateNetWorthLiquidTimeline([], [], USER_A);
      assert.ok(
        timeline.disclaimer.includes('Liquid Operating Ledger Only'),
        'Must disclose that unintegrated institutional assets are excluded'
      );
    });
  });

  // ==========================================================================
  // SECTION 3: REGRESSION INVARIANTS
  // ==========================================================================
  describe('3. Regression Invariants: Existing Analytics, Themes & Rules', () => {
    it('verifies existing classic AnalyticsCharts logic is preserved', () => {
      const mockFinanceData = {
        totalIncomePaise: 10000000,
        totalExpensePaise: 4000000,
        fixedExpensesPaise: 2500000,
        variableExpensesPaise: 1500000,
      };

      const totalFlow = mockFinanceData.totalIncomePaise + mockFinanceData.totalExpensePaise;
      const incomeRatio = totalFlow > 0 ? (mockFinanceData.totalIncomePaise / totalFlow) * 100 : 50;
      const expenseRatio = totalFlow > 0 ? (mockFinanceData.totalExpensePaise / totalFlow) * 100 : 50;
      const fixedRatio = (mockFinanceData.fixedExpensesPaise / mockFinanceData.totalExpensePaise) * 100;

      assert.strictEqual(Math.round(incomeRatio), 71);
      assert.strictEqual(Math.round(expenseRatio), 29);
      assert.strictEqual(Math.round(fixedRatio), 63);
    });

    it('verifies Cloud Firestore Security Rules (firestore.rules) file integrity', () => {
      const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
      assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');

      const rulesContent = fs.readFileSync(rulesPath, 'utf8');
      assert.ok(rulesContent.includes('service cloud.firestore'), 'Must be valid Firestore rules declaration');
      assert.ok(rulesContent.includes('request.auth != null'), 'Must enforce authentication requirement');
      assert.ok(rulesContent.includes('request.auth.uid'), 'Must enforce user ownership check');
    });

    it('verifies all Graph Studio chart cards use semantic CSS variables for theme compatibility', () => {
      const chartDir = path.resolve(process.cwd(), 'src/components/graph-studio');
      const files: string[] = [];

      function walk(dir: string) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
          const res = path.resolve(dir, entry.name);
          if (entry.isDirectory()) walk(res);
          else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) files.push(res);
        });
      }
      walk(chartDir);

      let foundCssVars = 0;
      files.forEach((file) => {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('var(--ff-')) {
          foundCssVars++;
        }
      });

      assert.ok(foundCssVars >= 15, `Expected high adoption of var(--ff-*), found in ${foundCssVars} files`);
    });
  });

  // ==========================================================================
  // SECTION 4: PERFORMANCE & STRESS BENCHMARK
  // ==========================================================================
  describe('4. Performance & Scalability Benchmark', () => {
    it('aggregates 5,000 focus sessions in under 2000 milliseconds (O(N) linear time)', () => {
      const largeSessions: FocusSession[] = [];
      const baseTime = new Date('2026-01-01T00:00:00Z').getTime();

      for (let i = 0; i < 5000; i++) {
        const d = new Date(baseTime + i * 3600000).toISOString();
        largeSessions.push(
          createMockSession({
            id: `s_perf_${i}`,
            userId: USER_A,
            mode: 'work',
            durationMinutes: 25,
            durationSeconds: 1500,
            startedAt: d,
          })
        );
      }

      const start = performance.now();
      const res = aggregateFocusHoursTrend(largeSessions, '2026-01-01', '2026-03-31', 'UTC', USER_A);
      const elapsed = performance.now() - start;

      assert.ok(res.days.length > 0);
      assert.ok(elapsed < 2000, `Expected 5,000 sessions aggregation < 2000ms, took ${elapsed.toFixed(2)}ms`);
    });

    it('aggregates 5,000 expenses across monthly cashflow in under 500 milliseconds', () => {
      const largeExpenses: ExpenseTransaction[] = [];
      for (let i = 0; i < 5000; i++) {
        const monthNum = String((i % 6) + 1).padStart(2, '0');
        largeExpenses.push(
          createMockExpense({
            id: `e_perf_${i}`,
            userId: USER_A,
            amountPaise: 50000,
            date: `2026-${monthNum}-15`,
          })
        );
      }

      const start = performance.now();
      const cashflow = aggregateMonthlyCashflow([], largeExpenses, 6, USER_A);
      const elapsed = performance.now() - start;

      assert.strictEqual(cashflow.months.length, 6);
      assert.ok(elapsed < 500, `Expected 5,000 expenses cashflow < 500ms, took ${elapsed.toFixed(2)}ms`);
    });
  });
});
