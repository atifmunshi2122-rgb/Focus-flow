import test from 'node:test';
import assert from 'node:assert/strict';
import { dbService } from '../server/db.ts';

test('Payments & Undo — Atomic Bill Payment and Duplicate Prevention', () => {
  const userId = 'usr_test_payments_' + Date.now();
  dbService.ensureUserWorkspace(userId);

  const raw = dbService.getRaw();
  // Create an unpaid bill
  const billId = 'bill_test_1';
  raw.bills.push({
    id: billId,
    userId,
    recurringExpenseId: null,
    name: 'High-speed Fiber Internet',
    amountPaise: 149900, // ₹1,499.00
    categoryId: 'cat_internet',
    dueDate: '2026-12-15',
    status: 'UNPAID',
    paymentDate: null,
    notes: 'Primary line',
    periodKey: '2026-12',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  dbService.save();

  // First payment attempt should succeed
  const payResult = dbService.payBill(userId, billId, '2026-12-14', 'upi_bank', 'Paid via UPI auto-pay');
  assert.equal(payResult.success, true);
  assert.equal(payResult.bill?.status, 'PAID');
  assert.equal(payResult.bill?.paymentDate, '2026-12-14');

  // Verify payment history record created
  const history = raw.paymentHistory.filter((p) => p.userId === userId && p.billId === billId);
  assert.equal(history.length, 1);
  assert.equal(history[0].amountPaise, 149900);
  assert.equal(history[0].paymentMethod, 'upi_bank');

  // Verify matching expense transaction created
  const expenses = raw.expenseTransactions.filter((e) => e.userId === userId && e.billId === billId && !e.deletedAt);
  assert.equal(expenses.length, 1);
  assert.equal(expenses[0].amountPaise, 149900);
  assert.equal(expenses[0].type, 'fixed');

  // Duplicate payment attempt MUST fail
  const duplicatePay = dbService.payBill(userId, billId, '2026-12-14', 'upi_bank', 'Attempt duplicate');
  assert.equal(duplicatePay.success, false);
  assert.ok(duplicatePay.error?.toLowerCase().includes('already marked as paid'));

  // Ensure no duplicate payment history or expense records were created
  const historyAfter = raw.paymentHistory.filter((p) => p.userId === userId && p.billId === billId);
  assert.equal(historyAfter.length, 1);

  // Clean up test workspace
  dbService.clearWorkspace(userId);
  dbService.save();
});

test('Payments & Undo — Non-Destructive Payment Undo Preserving Audit Trail', () => {
  const userId = 'usr_test_undo_' + Date.now();
  dbService.ensureUserWorkspace(userId);
  const raw = dbService.getRaw();

  const billId = 'bill_undo_test_1';
  raw.bills.push({
    id: billId,
    userId,
    recurringExpenseId: null,
    name: 'Cloud Server VPS',
    amountPaise: 450000, // ₹4,500.00
    categoryId: 'cat_servers',
    dueDate: '2026-11-20',
    status: 'UNPAID',
    paymentDate: null,
    notes: '',
    periodKey: '2026-11',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  dbService.save();

  // Pay the bill
  const payRes = dbService.payBill(userId, billId, '2026-11-19', 'credit_card', 'Credit card transaction');
  assert.equal(payRes.success, true);

  // Undo the payment
  const undoRes = dbService.undoBillPayment(userId, billId);
  assert.equal(undoRes.success, true);
  assert.equal(undoRes.bill?.paymentDate, null);
  // Status should be UNPAID or OVERDUE, never PAID
  assert.ok(undoRes.bill?.status === 'UNPAID' || undoRes.bill?.status === 'OVERDUE');

  // Payment history record MUST NOT be destroyed! It must have status: 'reversed' and reversedAt set
  const historyItems = raw.paymentHistory.filter((p) => p.userId === userId && p.billId === billId);
  assert.equal(historyItems.length, 1);
  assert.equal(historyItems[0].status, 'reversed');
  assert.ok(historyItems[0].reversedAt !== null && historyItems[0].reversedAt !== undefined);

  // Linked expense transaction MUST be soft-deleted (deletedAt != null), not purged
  const linkedExpenses = raw.expenseTransactions.filter((e) => e.userId === userId && e.billId === billId);
  assert.equal(linkedExpenses.length, 1);
  assert.ok(linkedExpenses[0].deletedAt !== null && linkedExpenses[0].deletedAt !== undefined);

  // Undoing a non-paid bill MUST fail
  const invalidUndo = dbService.undoBillPayment(userId, billId);
  assert.equal(invalidUndo.success, false);
  assert.ok(invalidUndo.error?.toLowerCase().includes('not marked as paid'));

  // Audit trail verification
  const auditLogs = dbService.getAuditLogs(userId);
  const payLog = auditLogs.find((l) => l.action === 'pay' && l.entityId === billId);
  const undoLog = auditLogs.find((l) => l.action === 'undo_payment' && l.entityId === billId);
  assert.ok(payLog !== undefined, 'Audit log for pay must exist');
  assert.ok(undoLog !== undefined, 'Audit log for undo_payment must exist');

  // Clean up test workspace
  dbService.clearWorkspace(userId);
  dbService.save();
});

