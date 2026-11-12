import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNextRecurrenceDueDate, getDaysInMonth, isLeapYear } from '../src/lib/dateTime.ts';
import { dbService } from '../server/db.ts';

test('Recurring Bills — Leap Year and Month-End Recurrence Arithmetic', () => {
  // Leap year verification
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2025), false);
  assert.equal(isLeapYear(2026), false);
  assert.equal(isLeapYear(2028), true);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);

  // Exact days in month
  assert.equal(getDaysInMonth(2026, 2), 28);
  assert.equal(getDaysInMonth(2028, 2), 29);
  assert.equal(getDaysInMonth(2026, 4), 30);
  assert.equal(getDaysInMonth(2026, 5), 31);

  // Monthly recurrence starting on Jan 31
  // 1. Jan 31, 2026 -> Feb 28, 2026 (non-leap year, must NOT roll over to March 3!)
  assert.equal(computeNextRecurrenceDueDate('2026-01-31', 'monthly'), '2026-02-28');

  // 2. Jan 31, 2028 -> Feb 29, 2028 (leap year)
  assert.equal(computeNextRecurrenceDueDate('2028-01-31', 'monthly'), '2028-02-29');

  // 3. March 31, 2026 -> April 30, 2026 (April has 30 days)
  assert.equal(computeNextRecurrenceDueDate('2026-03-31', 'monthly'), '2026-04-30');

  // 4. May 31, 2026 -> June 30, 2026 (June has 30 days)
  assert.equal(computeNextRecurrenceDueDate('2026-05-31', 'monthly'), '2026-06-30');

  // 5. Quarterly recurrence starting Jan 31 -> April 30
  assert.equal(computeNextRecurrenceDueDate('2026-01-31', 'quarterly'), '2026-04-30');

  // 6. Annual recurrence starting leap day Feb 29, 2024 -> Feb 28, 2025
  assert.equal(computeNextRecurrenceDueDate('2024-02-29', 'yearly'), '2025-02-28');
});

test('Recurring Bills — Idempotent Generation via Period Keys', () => {
  const userId = 'usr_test_recurring_' + Date.now();
  dbService.ensureUserWorkspace(userId);
  const raw = dbService.getRaw();

  // Create recurring expense template due on the 5th
  raw.recurringExpenses.push({
    id: 'rec_rent_1',
    userId,
    name: 'Office Space Lease',
    amountPaise: 5000000, // ₹50,000.00
    categoryId: 'cat_rent',
    recurrence: 'monthly',
    dueDay: 5,
    notes: 'Monthly workspace rent',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  dbService.save();

  // Run recurring bills check first time
  dbService.checkRecurringBills(userId);
  const billsAfterFirstCheck = raw.bills.filter((b) => b.userId === userId && b.recurringExpenseId === 'rec_rent_1');
  assert.equal(billsAfterFirstCheck.length, 1);
  const createdPeriodKey = billsAfterFirstCheck[0].periodKey;
  assert.ok(createdPeriodKey !== '');

  // Run recurring bills check second time (simulate rapid refresh or multiple cron runs)
  dbService.checkRecurringBills(userId);
  const billsAfterSecondCheck = raw.bills.filter((b) => b.userId === userId && b.recurringExpenseId === 'rec_rent_1');
  // MUST NOT create duplicate bills for the same period key!
  assert.equal(billsAfterSecondCheck.length, 1);

  // Clean up test workspace
  dbService.clearWorkspace(userId);
  dbService.save();
});
