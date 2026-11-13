import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpendingInsights } from '../src/lib/financeIntelligence.ts';
import { evaluateDeterministicNotifications } from '../src/lib/notificationsEngine.ts';
import { buildCsvContent } from '../src/lib/exportReports.ts';
import type { ExpenseTransaction, IncomeTransaction, UserSettings, SavingsGoal } from '../src/types/index.ts';

test('Phase 3 — Spending Insights Math & Pattern Recognition', () => {
  const sampleExpenses: ExpenseTransaction[] = [
    {
      id: 'e1',
      userId: 'u1',
      billId: null,
      type: 'variable',
      categoryId: 'groceries',
      categoryName: 'Groceries',
      amountPaise: 400000, // ₹4000
      date: '2026-11-10', // Tuesday
      description: 'Supermarket restock',
      paymentMethod: 'upi_bank',
      notes: '',
      createdAt: '2026-11-10T10:00:00Z',
    },
    {
      id: 'e2',
      userId: 'u1',
      billId: null,
      type: 'variable',
      categoryId: 'dining',
      categoryName: 'Dining',
      amountPaise: 150000, // ₹1500
      date: '2026-11-12', // Thursday
      description: 'Dinner with team',
      paymentMethod: 'credit_card',
      notes: '',
      createdAt: '2026-11-12T20:00:00Z',
    },
    {
      id: 'e3',
      userId: 'u1',
      billId: null,
      type: 'variable',
      categoryId: 'groceries',
      categoryName: 'Groceries',
      amountPaise: 100000, // ₹1000
      date: '2026-11-13', // Friday (Today)
      description: 'Fresh fruits',
      paymentMethod: 'upi_bank',
      notes: '',
      createdAt: '2026-11-13T09:00:00Z',
    },
    {
      id: 'e_prev',
      userId: 'u1',
      billId: null,
      type: 'variable',
      categoryId: 'groceries',
      categoryName: 'Groceries',
      amountPaise: 300000, // ₹3000 last month
      date: '2026-10-15',
      description: 'October groceries',
      paymentMethod: 'upi_bank',
      notes: '',
      createdAt: '2026-10-15T10:00:00Z',
    },
  ];

  const mockSettings: UserSettings = {
    userId: 'u1',
    currency: 'INR',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    theme: 'system',
    monthlyBudgetPaise: 5000000, // ₹50,000
    dailySpendingLimitPaise: 200000, // ₹2,000
  };

  const insights = computeSpendingInsights({
    expenses: sampleExpenses,
    settings: mockSettings,
    todayStr: '2026-11-13',
  });

  // 1. Top category is Groceries (₹4000 + ₹1000 = ₹5000)
  assert.equal(insights.topCategory?.name, 'Groceries');
  assert.equal(insights.topCategory?.amountPaise, 500000);
  assert.equal(insights.thisMonthExpensesPaise, 650000); // 4000 + 1500 + 1000

  // 2. Weekday with highest spend is Tuesday (₹4000 on 2026-11-10)
  assert.equal(insights.highestWeekday?.dayName, 'Tuesday');
  assert.equal(insights.highestWeekday?.amountPaise, 400000);

  // 3. Category growth: Groceries grew from ₹3000 to ₹5000 (+67%)
  assert.ok(insights.increasingCategories.some((c) => c.name === 'Groceries'));

  // 4. Today's spending on 2026-11-13: ₹1000 spent vs ₹2000 limit -> not over limit, remaining ₹1000
  assert.equal(insights.todaySpending.totalPaise, 100000);
  assert.equal(insights.todaySpending.isOverLimit, false);
  assert.equal(insights.todaySpending.remainingPaise, 100000);

  // 5. Day over day: Yesterday (2026-11-12) was ₹1500, today is ₹1000 -> -₹500 vs yesterday
  assert.equal(insights.todaySpending.vsYesterdayPaise, -50000);
});

test('Phase 3 — Deterministic Financial Alerts & Limits', () => {
  const mockSettings: UserSettings = {
    userId: 'u1',
    currency: 'INR',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    theme: 'system',
    monthlyBudgetPaise: 2000000, // ₹20,000
    dailySpendingLimitPaise: 100000, // ₹1,000
    weeklySpendingLimitPaise: 500000, // ₹5,000
  };

  const sampleGoals: SavingsGoal[] = [
    {
      id: 'g1',
      userId: 'u1',
      title: 'Emergency Fund',
      targetPaise: 1000000,
      savedPaise: 1000000, // 100% achieved!
      targetDate: '2026-12-31',
      color: '#10b981',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-13T00:00:00Z',
    },
  ];

  const sampleExpenses: ExpenseTransaction[] = [
    {
      id: 'e_huge',
      userId: 'u1',
      billId: null,
      type: 'variable',
      categoryId: 'tech',
      categoryName: 'Tech Equipment',
      amountPaise: 1500000, // ₹15,000 (large single expense)
      date: new Date().toISOString().slice(0, 10),
      description: 'Mac Studio Hardware',
      paymentMethod: 'credit_card',
      notes: '',
      createdAt: new Date().toISOString(),
    },
  ];

  const alerts = evaluateDeterministicNotifications({
    settings: mockSettings,
    tasks: [],
    bills: [],
    dashboard: {
      todayFocusMinutes: 45,
      completedPomodoroSessions: 2,
      focusStreakDays: 5,
      todayExpensesPaise: 120000, // ₹1200 (exceeds ₹1000 limit)
      weeklyExpensesPaise: 550000, // ₹5500 (exceeds ₹5000 limit)
      monthlyIncomePaise: 10000000,
      monthlyExpensesPaise: 1800000,
      fixedExpensesPaise: 500000,
      variableExpensesPaise: 1300000,
      remainingBalancePaise: 8200000,
      paidBillsCount: 2,
      unpaidBillsCount: 0,
      totalPaidAmountPaise: 500000,
      totalUnpaidAmountPaise: 0,
      upcomingPayments: [],
      recentTransactions: [],
    },
    financeSummary: null,
    savingsGoals: sampleGoals,
    expenses: sampleExpenses,
  });

  // Verify daily limit alert
  assert.ok(alerts.some((a) => a.id.startsWith('daily_limit_reached_')));

  // Verify weekly limit alert
  assert.ok(alerts.some((a) => a.id.startsWith('weekly_limit_exceeded_')));

  // Verify savings goal achievement alert
  assert.ok(alerts.some((a) => a.id === 'goal_achieved_g1'));

  // Verify unusual large expense alert
  assert.ok(alerts.some((a) => a.id === 'unusual_expense_e_huge'));
});

test('Phase 3 — Financial Reports CSV Generation Integrity', () => {
  const headers = ['Record Type', 'Date', 'Description', 'Amount'];
  const rows = [
    ['Expense', '2026-11-13', 'Cloud Server "US-East"', '1250.00'],
    ['Income', '2026-11-13', 'Client Retainer, LLC', '50000.00'],
  ];

  const csv = buildCsvContent(headers, rows);
  assert.ok(csv.includes('Record Type,Date,Description,Amount'));
  assert.ok(csv.includes('"Cloud Server ""US-East"""'));
  assert.ok(csv.includes('"Client Retainer, LLC"'));
});
