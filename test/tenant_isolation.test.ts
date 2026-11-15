import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { dbService } from '../server/db.ts';
import { apiRouter } from '../server/routes.ts';

test('Tenant Isolation — Test 1: clearWorkspace for guest leaves usr_atif_default records untouched', () => {
  const defaultUser = 'usr_atif_default';
  const guestUser = 'gst_test_guest_clear_01';

  dbService.ensureUserWorkspace(defaultUser);
  dbService.ensureUserWorkspace(guestUser);

  const raw = dbService.getRaw();

  // Seed default user records
  raw.tasks.push({
    id: 'task_atif_safe_01',
    userId: defaultUser,
    title: 'Atif Safe Task',
    description: '',
    priority: 'high',
    status: 'todo',
    dueDate: '2026-11-20',
    estimatedPomodoros: 2,
    completedPomodoros: 0,
    subtasks: [],
    recurrence: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  raw.focusSessions.push({
    id: 'session_atif_safe_01',
    userId: defaultUser,
    taskId: 'task_atif_safe_01',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMinutes: 25,
    durationSeconds: 1500,
    completed: true,
    mode: 'work',
  });

  // Seed guest records
  raw.tasks.push({
    id: 'task_guest_01',
    userId: guestUser,
    title: 'Guest Temporary Task',
    description: '',
    priority: 'low',
    status: 'todo',
    dueDate: '2026-11-20',
    estimatedPomodoros: 1,
    completedPomodoros: 0,
    subtasks: [],
    recurrence: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  raw.focusSessions.push({
    id: 'session_guest_01',
    userId: guestUser,
    taskId: 'task_guest_01',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMinutes: 25,
    durationSeconds: 1500,
    completed: true,
    mode: 'work',
  });

  // Guest clears their own workspace
  dbService.clearWorkspace(guestUser);

  // Assert guest records are removed
  assert.equal(raw.tasks.some((t) => t.userId === guestUser), false);
  assert.equal(raw.focusSessions.some((s) => s.userId === guestUser), false);

  // Assert usr_atif_default records are strictly preserved
  assert.equal(raw.tasks.some((t) => t.id === 'task_atif_safe_01'), true);
  assert.equal(raw.focusSessions.some((s) => s.id === 'session_atif_safe_01'), true);
});

test('Tenant Isolation — Test 2: deleteTimeBlock as guest targeting usr_atif_default fails and returns false', () => {
  const defaultUser = 'usr_atif_default';
  const guestUser = 'gst_test_guest_tb_02';

  const block = dbService.saveTimeBlock(defaultUser, {
    date: '2026-11-20',
    startMinute: 540,
    endMinute: 600,
    title: 'Default User Morning Deep Work',
    category: 'Work',
  });

  assert.ok(block.id);

  // Attempt delete as guest
  const result = dbService.deleteTimeBlock(guestUser, block.id);
  assert.equal(result, false);

  // Verify time block is still present, active, and intact
  const raw = dbService.getRaw();
  const existing = (raw.timeBlocks || []).find((tb) => tb.id === block.id);
  assert.ok(existing);
  assert.equal(existing.userId, defaultUser);
  assert.equal(existing.deletedAt, null);
});

test('Tenant Isolation — Test 3: deleteEnvelope as guest targeting usr_atif_default fails and returns false', () => {
  const defaultUser = 'usr_atif_default';
  const guestUser = 'gst_test_guest_env_03';

  const env = dbService.saveEnvelope(defaultUser, {
    name: 'Atif Emergency Envelope',
    allocatedPaise: 500000,
    monthKey: '2026-11',
    color: '#10b981',
  });

  assert.ok(env.id);

  // Attempt delete as guest
  const result = dbService.deleteEnvelope(guestUser, env.id);
  assert.equal(result, false);

  // Verify envelope is still present, active, and intact
  const raw = dbService.getRaw();
  const existing = (raw.envelopes || []).find((e) => e.id === env.id);
  assert.ok(existing);
  assert.equal(existing.userId, defaultUser);
  assert.equal(existing.deletedAt, null);
});

test('Tenant Isolation — Test 4: deleteSubscription as guest targeting usr_atif_default fails and returns false', () => {
  const defaultUser = 'usr_atif_default';
  const guestUser = 'gst_test_guest_sub_04';

  const sub = dbService.saveSubscription(defaultUser, {
    name: 'Atif Cloud Subscription',
    amountPaise: 120000,
    billingCycle: 'monthly',
    nextRenewalDate: '2026-12-01',
    reminderDays: 3,
    categoryId: 'cat_cloud',
    autoRenew: true,
  });

  assert.ok(sub.id);

  // Attempt delete as guest
  const result = dbService.deleteSubscription(guestUser, sub.id);
  assert.equal(result, false);

  // Verify subscription is still present, active, and intact
  const raw = dbService.getRaw();
  const existing = (raw.subscriptions || []).find((s) => s.id === sub.id);
  assert.ok(existing);
  assert.equal(existing.userId, defaultUser);
  assert.equal(existing.deletedAt, null);
});

test('Tenant Isolation — Test 5: deleteStudyTier as guest targeting usr_atif_default or shared tier fails and returns false', () => {
  const defaultUser = 'usr_atif_default';
  const guestUser = 'gst_test_guest_tier_05';

  const tier = dbService.saveStudyTier(defaultUser, {
    name: 'Security Engineering',
    shortTitle: 'SecEng',
  });

  assert.ok(tier.id);

  // Attempt delete as guest
  const result = dbService.deleteStudyTier(guestUser, tier.id);
  assert.equal(result, false);

  // Verify tier is still active and not deleted
  const raw = dbService.getRaw();
  const existing = (raw.studyTiers || []).find((t) => t.id === tier.id);
  assert.ok(existing);
  assert.equal(existing.userId, defaultUser);
  assert.equal(existing.deletedAt, null);
});

test('Tenant Isolation — Test 6: Authenticated user usr_b cannot delete usr_atif_default items', () => {
  const defaultUser = 'usr_atif_default';
  const attackerUser = 'usr_tenant_b_attacker';

  // Seed study topic, revision, and mistake for default user
  const topic = dbService.saveStudyTopic(defaultUser, {
    subjectCode: 'CS101',
    unit: '1',
    topic: 'Operating Systems Isolation',
    subtopic: 'Processes',
    priority: 'High',
  });
  const revision = dbService.saveStudyRevision(defaultUser, {
    subjectCode: 'CS101',
    topicId: topic.id,
    topicTitle: topic.topic,
    nextRevisionAt: '2026-11-20',
  });
  const mistake = dbService.saveStudyMistake(defaultUser, {
    subjectCode: 'CS101',
    topic: 'Memory safety',
    source: 'Exam',
    severity: 'High',
    trap: 'Buffer overflow',
    rootCause: 'No bounds check',
    goldenRule: 'Always check bounds',
  });

  // Cross-tenant delete attempts by usr_b
  assert.equal(dbService.deleteStudyTopic(attackerUser, topic.id), false);
  assert.equal(dbService.deleteStudyRevision(attackerUser, revision.id), false);
  assert.equal(dbService.deleteStudyMistake(attackerUser, mistake.id), false);

  // Verify all remain active for default user
  const raw = dbService.getRaw();
  assert.equal((raw.studyTopics || []).find((t) => t.id === topic.id)?.deletedAt, null);
  assert.equal((raw.studyRevisions || []).find((r) => r.id === revision.id)?.deletedAt, null);
  assert.equal((raw.studyMistakes || []).find((m) => m.id === mistake.id)?.deletedAt, null);
});

test('Tenant Isolation — Test 7: Route-level API cross-tenant isolation and guest workspace clear protection', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const defaultUser = 'usr_atif_default';
  const guestSession = 'gst_attacker_guest_session_99';

  try {
    const raw = dbService.getRaw();

    // 1. Seed items directly for default user
    const taskId = 'task_atif_route_protected_01';
    raw.tasks.push({
      id: taskId,
      userId: defaultUser,
      title: 'Protected Corporate Task',
      priority: 'high',
      status: 'in_progress',
      description: '',
      dueDate: '2026-11-20',
      estimatedPomodoros: 2,
      completedPomodoros: 0,
      subtasks: [],
      recurrence: 'none',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const billId = 'bill_atif_route_protected_01';
    raw.bills.push({
      id: billId,
      userId: defaultUser,
      name: 'Protected Rent Bill',
      amountPaise: 4500000,
      dueDate: '2026-12-01',
      categoryId: 'Housing',
      status: 'UNPAID',
      paymentDate: null,
      notes: '',
      periodKey: '2026-12',
      recurringExpenseId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const block = dbService.saveTimeBlock(defaultUser, {
      date: '2026-11-20',
      startMinute: 840,
      endMinute: 900,
      title: 'Protected Executive Review',
      category: 'Executive',
    });

    // 2. Guest attempts to clear workspace via POST /api/workspace/clear
    const clearRes = await fetch(`${baseUrl}/workspace/clear`, {
      method: 'POST',
      headers: {
        'x-demo-session': guestSession,
        'Content-Type': 'application/json',
      },
    });
    assert.equal(clearRes.status, 200);

    // 3. Verify default user items were NOT deleted by guest clear
    const rawAfterClear = dbService.getRaw();
    assert.ok(rawAfterClear.tasks.some((t) => t.id === taskId && !t.deletedAt));
    assert.ok(rawAfterClear.bills.some((b) => b.id === billId && !b.deletedAt));
    assert.ok((rawAfterClear.timeBlocks || []).some((tb) => tb.id === block.id));

    // 4. Guest attempts targeted DELETE on default user's task
    const deleteTaskRes = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { 'x-demo-session': guestSession },
    });
    assert.equal(deleteTaskRes.status, 404);

    // 5. Guest attempts targeted DELETE on default user's bill
    const deleteBillRes = await fetch(`${baseUrl}/finance/bills/${billId}`, {
      method: 'DELETE',
      headers: { 'x-demo-session': guestSession },
    });
    assert.equal(deleteBillRes.status, 404);

    // 6. Guest attempts targeted DELETE on default user's time block
    const deleteBlockRes = await fetch(`${baseUrl}/time-blocks/${block.id}`, {
      method: 'DELETE',
      headers: { 'x-demo-session': guestSession },
    });
    assert.equal(deleteBlockRes.status, 404);

    // 7. Verify all default user items remain completely untouched and active
    const rawFinal = dbService.getRaw();
    assert.equal(rawFinal.tasks.find((t) => t.id === taskId)?.deletedAt, undefined);
    assert.equal(rawFinal.bills.find((b) => b.id === billId)?.deletedAt, undefined);
    assert.ok((rawFinal.timeBlocks || []).find((tb) => tb.id === block.id));
  } finally {
    server.close();
  }
});

test('Tenant Isolation — Test 8: Guest can create, read, update, delete, and clear their OWN records', async () => {
  const guestUser = 'gst_legitimate_guest_session_88';

  // 1. Guest creates their own time block, envelope, and subscription
  const block = dbService.saveTimeBlock(guestUser, {
    date: '2026-11-20',
    startMinute: 600,
    endMinute: 660,
    title: 'Guest Study Block',
    category: 'Study',
  });
  assert.ok(block.id);
  assert.equal(block.userId, guestUser);

  const env = dbService.saveEnvelope(guestUser, {
    name: 'Guest Groceries',
    allocatedPaise: 200000,
    monthKey: '2026-11',
    color: '#3b82f6',
  });
  assert.ok(env.id);
  assert.equal(env.userId, guestUser);

  const sub = dbService.saveSubscription(guestUser, {
    name: 'Guest Streaming',
    amountPaise: 50000,
    billingCycle: 'monthly',
    nextRenewalDate: '2026-12-01',
    reminderDays: 1,
    categoryId: 'Entertainment',
    autoRenew: true,
  });
  assert.ok(sub.id);
  assert.equal(sub.userId, guestUser);

  // 2. Guest can delete their own envelope
  const deleteEnvResult = dbService.deleteEnvelope(guestUser, env.id);
  assert.equal(deleteEnvResult, true);

  // 3. Guest can delete their own subscription
  const deleteSubResult = dbService.deleteSubscription(guestUser, sub.id);
  assert.equal(deleteSubResult, true);

  // 4. Guest can delete their own time block
  const deleteBlockResult = dbService.deleteTimeBlock(guestUser, block.id);
  assert.equal(deleteBlockResult, true);

  // 5. Verify guest records are soft-deleted and filtered out in queries
  const raw = dbService.getRaw();
  assert.ok((raw.envelopes || []).find((e) => e.id === env.id)?.deletedAt);
  assert.ok((raw.subscriptions || []).find((s) => s.id === sub.id)?.deletedAt);
  assert.ok((raw.timeBlocks || []).find((tb) => tb.id === block.id)?.deletedAt);

  assert.equal(dbService.getEnvelopes(guestUser).length, 0);
  assert.equal(dbService.getSubscriptions(guestUser).length, 0);
  assert.equal(dbService.getTimeBlocks(guestUser, '2026-11-20').length, 0);
});
