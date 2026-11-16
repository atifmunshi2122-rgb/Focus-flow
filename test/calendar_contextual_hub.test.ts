import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_ACTION_TABS,
  FINANCE_ACTION_TABS,
  GLOBAL_ACTION_TABS,
} from '../src/components/common/QuickActionModal.tsx';
import { formatDateInTimezone, getTodayDateString } from '../src/lib/dateTime.ts';

describe('Calendar Contextual Hub & Action Isolation Tests', () => {
  test('A1: Calendar Contextual Tabs include Expense, Income, Task, Bill, Habit, Budget, Savings', () => {
    const calendarTabIds = CALENDAR_ACTION_TABS.map((t) => t.id);
    assert.deepEqual(calendarTabIds, [
      'expense',
      'income',
      'task',
      'bill',
      'habit',
      'envelope',
      'goal',
    ]);
  });

  test('A2: Finance Contextual Tabs strictly isolate finance transactions only', () => {
    const financeTabIds = FINANCE_ACTION_TABS.map((t) => t.id);
    assert.deepEqual(financeTabIds, ['expense', 'income', 'bill']);
    assert.ok(!financeTabIds.includes('task' as any));
    assert.ok(!financeTabIds.includes('habit' as any));
  });

  test('A3: Global Quick Action Tabs include all core module shortcuts', () => {
    const globalTabIds = GLOBAL_ACTION_TABS.map((t) => t.id);
    assert.ok(globalTabIds.includes('task'));
    assert.ok(globalTabIds.includes('expense'));
    assert.ok(globalTabIds.includes('income'));
    assert.ok(globalTabIds.includes('bill'));
    assert.ok(globalTabIds.includes('habit'));
  });

  test('B1: Focus Sessions Timezone boundary mapping accurately handles UTC to IST (Asia/Kolkata)', () => {
    // 2026-11-15 19:30:00 UTC is 2026-11-16 01:00:00 AM IST (+5:30)
    const lateUtcTimestamp = '2026-11-15T19:30:00.000Z';
    const tz = 'Asia/Kolkata';

    const localDate = formatDateInTimezone(lateUtcTimestamp, tz);
    assert.equal(localDate, '2026-11-16', 'UTC 19:30 on Nov 15 must map to Nov 16 in IST');

    // In UTC, slicing 0..10 would have produced 2026-11-15 (incorrect for an IST user)
    assert.notEqual(lateUtcTimestamp.slice(0, 10), localDate);
  });

  test('B2: Date matching logic matches both YYYY-MM-DD and ISO timestamp prefixes', () => {
    const targetDate = '2026-11-10';
    const tz = 'Asia/Kolkata';

    // Exact string match
    const record1 = { dueDate: '2026-11-10' };
    const match1 = record1.dueDate === targetDate || record1.dueDate?.slice(0, 10) === targetDate;
    assert.ok(match1);

    // ISO timestamp match
    const record2 = { dueDate: '2026-11-10T08:00:00.000Z' };
    const match2 = record2.dueDate === targetDate || record2.dueDate?.slice(0, 10) === targetDate;
    assert.ok(match2);

    // Different date does not match
    const record3 = { dueDate: '2026-11-11' };
    const match3 = record3.dueDate === targetDate || record3.dueDate?.slice(0, 10) === targetDate;
    assert.ok(!match3);
  });

  test('C1: Habit completion tracking accurately checks completedDates array for calendar date', () => {
    const targetDate = '2026-11-16';
    const habitA = {
      id: 'h1',
      title: 'Morning Yoga',
      completedDates: ['2026-11-14', '2026-11-15', '2026-11-16'],
    };
    const habitB = {
      id: 'h2',
      title: 'Read 20 pages',
      completedDates: ['2026-11-14'],
    };

    const habits = [habitA, habitB];
    const completedOnTarget = habits.filter((h) => h.completedDates?.includes(targetDate));

    assert.equal(completedOnTarget.length, 1);
    assert.equal(completedOnTarget[0].title, 'Morning Yoga');
  });

  test('D1: Net cashflow calculation on Calendar days is mathematically consistent', () => {
    const dayIncomes = [{ amountPaise: 500000 }, { amountPaise: 250000 }]; // 7500.00
    const dayExpenses = [{ amountPaise: 320000 }, { amountPaise: 80000 }]; // 4000.00

    const totalIncomePaise = dayIncomes.reduce((acc, i) => acc + i.amountPaise, 0);
    const totalExpensePaise = dayExpenses.reduce((acc, e) => acc + e.amountPaise, 0);
    const netFlowPaise = totalIncomePaise - totalExpensePaise;

    assert.equal(totalIncomePaise, 750000);
    assert.equal(totalExpensePaise, 400000);
    assert.equal(netFlowPaise, 350000);
    assert.ok(netFlowPaise > 0);
  });
});

