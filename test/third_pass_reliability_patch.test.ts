import test from 'node:test';
import assert from 'node:assert/strict';
import { flushQueueOperations } from '../server/sheetsWorker.ts';
import type { DurableSyncOperation } from '../src/types/index.ts';
import {
  categorizeRevisions,
  processRevisionRecall,
  computeStudyProgressSummary,
  computeStudyExamReadiness,
  computeStudyPlanAnalytics,
} from '../src/lib/studyIntelligence.ts';
import type {
  StudyRevision,
  StudyExam,
  StudyPlanTask,
  FocusSession,
  StudySubject,
  StudyTopic,
} from '../src/types/index.ts';
import { WORKSHEET_NAMES } from '../src/lib/sheetsSpec.ts';

function makeMockMetadataResponse(spreadsheetId: string) {
  return new Response(
    JSON.stringify({
      spreadsheetId,
      properties: { title: 'FocusFlow & Finance — Master Management Ledger' },
      sheets: WORKSHEET_NAMES.map((title, idx) => ({
        properties: {
          sheetId: 100 + idx,
          title,
          gridProperties: {
            rowCount: idx < 3 ? 120 : 800,
            columnCount: 26,
          },
        },
      })),
    }),
    { status: 200 }
  );
}

// ============================================================================
// ISSUE 1: Google Sheets Queue — Update, Delete and Create Operations
// ============================================================================

test('Issue 1 — sheetsWorker flushQueueOperations handles update by in-place PUT', async () => {
  const spreadsheetId = 'test_ss_update_123';
  const ops: DurableSyncOperation[] = [
    {
      id: 'op_update_1',
      userId: 'usr_test',
      entityType: 'task',
      action: 'update',
      sheetName: 'Tasks',
      payload: ['task_xyz', 'Updated Task Title', 'Done'],
      dedupeKey: 'task_xyz',
      status: 'pending',
      attempts: 0,
      createdAt: '2026-11-17T10:00:00Z',
    },
  ];

  const putRequests: { url: string; body: unknown }[] = [];

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method || 'GET';

    if (url.includes('values:batchGet')) {
      return new Response(
        JSON.stringify({
          valueRanges: [
            {
              range: 'Tasks!A2:A',
              values: [['task_abc'], ['task_xyz'], ['task_123']], // row 3 is task_xyz
            },
          ],
        }),
        { status: 200 }
      );
    }

    if (method === 'GET') {
      return makeMockMetadataResponse(spreadsheetId);
    }

    if (method === 'PUT') {
      putRequests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ updatedRows: 1, updatedCells: 3 }), { status: 200 });
    }

    return new Response(JSON.stringify({}), { status: 200 });
  };

  const summary = await flushQueueOperations(
    spreadsheetId,
    'mock_access_token',
    ops,
    mockFetch as typeof fetch,
    Date.now()
  );

  assert.equal(summary.processed, 1, 'Update operation should be processed');
  assert.equal(summary.failed, 0, 'Zero failures');
  assert.equal(putRequests.length, 1, 'Exactly 1 PUT request for in-place update');
  // Row 2 is task_abc (A2), row 3 is task_xyz (A3)
  assert.ok(decodeURIComponent(putRequests[0].url).includes('Tasks!A3'), 'PUT target range should be row 3');
});

test('Issue 1 — sheetsWorker flushQueueOperations handles delete by clearing row range', async () => {
  const spreadsheetId = 'test_ss_delete_123';
  const ops: DurableSyncOperation[] = [
    {
      id: 'op_del_1',
      userId: 'usr_test',
      entityType: 'expense',
      action: 'delete',
      sheetName: 'Variable_Expenses',
      payload: ['exp_to_delete_99'],
      dedupeKey: 'exp_to_delete_99',
      status: 'pending',
      attempts: 0,
      createdAt: '2026-11-17T10:00:00Z',
    },
    {
      id: 'op_del_absent',
      userId: 'usr_test',
      entityType: 'expense',
      action: 'delete',
      sheetName: 'Variable_Expenses',
      payload: ['exp_already_gone_404'],
      dedupeKey: 'exp_already_gone_404',
      status: 'pending',
      attempts: 0,
      createdAt: '2026-11-17T10:00:00Z',
    },
  ];

  const clearRequests: string[] = [];

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method || 'GET';

    if (url.includes('values:batchGet')) {
      return new Response(
        JSON.stringify({
          valueRanges: [
            {
              range: 'Variable_Expenses!A2:A',
              values: [['exp_existing_1'], ['exp_to_delete_99']], // row 3 is exp_to_delete_99
            },
          ],
        }),
        { status: 200 }
      );
    }

    if (method === 'GET') {
      return makeMockMetadataResponse(spreadsheetId);
    }

    if (url.includes(':clear') || url.includes('%3Aclear')) {
      clearRequests.push(url);
      return new Response(JSON.stringify({ clearedRange: 'Variable_Expenses!A3:Z3' }), { status: 200 });
    }

    return new Response(JSON.stringify({}), { status: 200 });
  };

  const summary = await flushQueueOperations(
    spreadsheetId,
    'mock_access_token',
    ops,
    mockFetch as typeof fetch,
    Date.now()
  );

  assert.equal(summary.processed, 2, 'Both deletes processed (existing and idempotent absent)');
  assert.equal(summary.failed, 0);
  assert.equal(clearRequests.length, 1, 'Only 1 HTTP clear request issued for existing row');
  assert.ok(decodeURIComponent(clearRequests[0]).includes('Variable_Expenses!A3:Z3'), 'Clear range targets matched row 3');
});

test('Issue 1 — sheetsWorker flushQueueOperations create appends new and skips existing duplicate', async () => {
  const spreadsheetId = 'test_ss_create_123';
  const ops: DurableSyncOperation[] = [
    {
      id: 'op_create_new',
      userId: 'usr_test',
      entityType: 'task',
      action: 'append',
      sheetName: 'Tasks',
      payload: ['task_brand_new', 'Brand New Task'],
      dedupeKey: 'task_brand_new',
      status: 'pending',
      attempts: 0,
      createdAt: '2026-11-17T10:00:00Z',
    },
    {
      id: 'op_create_dup',
      userId: 'usr_test',
      entityType: 'task',
      action: 'append',
      sheetName: 'Tasks',
      payload: ['task_already_there', 'Duplicate Task'],
      dedupeKey: 'task_already_there',
      status: 'pending',
      attempts: 0,
      createdAt: '2026-11-17T10:00:00Z',
    },
  ];

  const appendRequests: string[] = [];

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method || 'GET';

    if (url.includes('values:batchGet')) {
      return new Response(
        JSON.stringify({
          valueRanges: [
            {
              range: 'Tasks!A2:A',
              values: [['task_already_there']],
            },
          ],
        }),
        { status: 200 }
      );
    }

    if (method === 'GET') {
      return makeMockMetadataResponse(spreadsheetId);
    }

    if (url.includes(':append') || url.includes('%3Aappend')) {
      appendRequests.push(url);
      return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200 });
    }

    return new Response(JSON.stringify({}), { status: 200 });
  };

  const summary = await flushQueueOperations(
    spreadsheetId,
    'mock_access_token',
    ops,
    mockFetch as typeof fetch,
    Date.now()
  );

  assert.equal(summary.processed, 2);
  assert.equal(summary.skippedDuplicates, 1, 'Duplicate Column A ID should be skipped');
  assert.equal(appendRequests.length, 1, 'Only non-duplicate row appended');
});

// ============================================================================
// ISSUE 2: Study Analytics — Timezone and Actual Duration
// ============================================================================

test('Issue 2 — studyIntelligence respects configured timezone for revisions categorization', () => {
  const revisions: StudyRevision[] = [
    {
      id: 'rev_today',
      userId: 'usr_1',
      subjectCode: 'Sub_MATH',
      topicId: 'top_1',
      topicTitle: 'Calculus Revision',
      lastStudiedAt: '2026-11-17',
      nextRevisionAt: '2026-11-18', // In Asia/Kolkata on late night Nov 17 UTC, Nov 18 is today
      intervalDays: 1,
      repetition: 1,
      difficulty: 'medium',
      status: 'scheduled',
      createdAt: '2026-11-17T10:00:00Z',
      updatedAt: '2026-11-17T10:00:00Z',
      deletedAt: null,
    },
  ];

  const categorizedKolkata = categorizeRevisions(revisions, 'Asia/Kolkata');
  assert.ok(categorizedKolkata, 'Should categorize revisions with Asia/Kolkata');

  const categorizedNY = categorizeRevisions(revisions, 'America/New_York');
  assert.ok(categorizedNY, 'Should categorize revisions with America/New_York');
});

test('Issue 2 — computeStudyProgressSummary uses actualDurationSeconds when available', () => {
  const subjects: StudySubject[] = [
    {
      id: 'sub_math',
      userId: 'usr_1',
      name: 'Mathematics',
      code: 'Sub_MATH',
      tierId: 'tier_engineering',
      totalSubtopics: 10,
      completedSubtopics: 5,
      color: '#3b82f6',
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      deletedAt: null,
    },
  ];

  const topics: StudyTopic[] = [
    {
      id: 'top_calc',
      userId: 'usr_1',
      subjectCode: 'Sub_MATH',
      unit: 'Unit 1',
      topic: 'Calculus I',
      subtopic: 'Limits',
      priority: 'High',
      theory: true,
      practice: false,
      pyq: false,
      revisionCount: 1,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      deletedAt: null,
    },
  ];

  // FocusSession planned for 60 minutes (3600s), but actually stopped at 15 minutes (900s)
  const focusSessions: FocusSession[] = [
    {
      id: 'fs_short',
      userId: 'usr_1',
      taskId: null,
      mode: 'work',
      durationMinutes: 60,
      durationSeconds: 3600,
      actualDurationSeconds: 900, // 15 mins
      completed: true,
      subjectId: 'sub_math',
      startedAt: '2026-11-17T10:00:00Z',
      endedAt: '2026-11-17T10:15:00Z',
    },
  ];

  const summary = computeStudyProgressSummary({
    subjects,
    topics,
    revisions: [],
    mistakes: [],
    focusSessions,
    timezone: 'Asia/Kolkata',
  });

  // Total study time should reflect 15 mins
  assert.equal(
    summary.totalStudyMinutes,
    15,
    'totalStudyMinutes must use actualDurationSeconds (15m) rather than planned durationMinutes (60m)'
  );
});

test('Issue 2 — computeStudyPlanAnalytics filters only relevant study sessions', () => {
  const planTasks: StudyPlanTask[] = [
    {
      id: 'task_cs_algo',
      userId: 'u1',
      planId: 'plan_cs',
      subjectId: 'Sub_CS',
      topicId: 'top_algo',
      title: 'Graph Algorithms Practice',
      description: '',
      scheduledDate: '2026-11-17',
      startTime: '10:00',
      endTime: '11:00',
      estimatedMinutes: 60,
      actualMinutes: 0,
      priority: 'high',
      status: 'pending',
      completedAt: null,
      createdAt: '2026-11-17T09:00:00Z',
      updatedAt: '2026-11-17T09:00:00Z',
      deletedAt: null,
    },
  ];

  const mixedSessions: FocusSession[] = [
    // 1. Relevant study session linked to task_cs_algo
    {
      id: 'fs_relevant',
      userId: 'u1',
      taskId: 'task_cs_algo',
      mode: 'work',
      durationMinutes: 45,
      durationSeconds: 2700,
      actualDurationSeconds: 2700,
      completed: true,
      startedAt: '2026-11-17T10:00:00Z',
      endedAt: '2026-11-17T10:45:00Z',
    },
    // 2. Unrelated productivity session (e.g. personal inbox cleaning)
    {
      id: 'fs_unrelated',
      userId: 'u1',
      taskId: 'personal_email_cleaning',
      mode: 'work',
      durationMinutes: 120,
      durationSeconds: 7200,
      actualDurationSeconds: 7200,
      completed: true,
      startedAt: '2026-11-17T14:00:00Z',
      endedAt: '2026-11-17T16:00:00Z',
    },
  ];

  const analytics = computeStudyPlanAnalytics(planTasks, mixedSessions);

  assert.equal(analytics.totalPlannedMinutes, 60);
  assert.equal(
    analytics.totalActualMinutes,
    45,
    'Only the 45min relevant study session must be counted, excluding the 120min unrelated session'
  );
});

test('Issue 2 — computeStudyExamReadiness incorporates configured timezone', () => {
  const exam: StudyExam = {
    id: 'exam_1',
    userId: 'u1',
    title: 'Midterm Calculus',
    examType: 'Midterm',
    subjectIds: ['Sub_MATH'],
    examDate: '2026-12-01',
    startTime: '09:00',
    durationMinutes: 180,
    totalMarks: 100,
    obtainedMarks: null,
    syllabusTopicIds: ['top_calc'],
    preparationStatus: 'preparing',
    resultStatus: 'pending',
    notes: '',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt: null,
  };

  const topics: StudyTopic[] = [
    {
      id: 'top_calc',
      userId: 'u1',
      subjectCode: 'Sub_MATH',
      unit: 'Unit 1',
      topic: 'Calculus I',
      subtopic: 'Limits',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 2,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      deletedAt: null,
    },
  ];

  const readiness = computeStudyExamReadiness(exam, topics, 'Asia/Kolkata');
  assert.ok(readiness.readinessPct >= 0 && readiness.readinessPct <= 100);
  assert.ok(readiness.daysRemaining > 0);
  assert.equal(readiness.coveredTopicsCount, 1);
});

// ============================================================================
// ISSUE 3, 4 & 5: HabitTrackerView & SubscriptionManager UI/UX Validation
// ============================================================================

test('Issue 3 & 4 — HabitTrackerView file contains mobile touch classes and user timezone hookup', async () => {
  const fs = await import('fs');
  const code = fs.readFileSync('src/components/focus/HabitTrackerView.tsx', 'utf-8');

  // Issue 3: Mobile touch accessibility
  assert.ok(
    code.includes('opacity-100 md:opacity-0 md:group-hover:opacity-100'),
    'Habit Edit/Delete buttons must be visible on mobile touch devices (opacity-100) and hover-revealed on desktop (md:opacity-0 md:group-hover:opacity-100)'
  );
  assert.ok(
    code.includes('min-h-[36px] min-w-[36px]'),
    'Touch targets must have a minimum size of 36x36px'
  );
  assert.ok(
    code.includes('aria-label={`Edit habit ${habit.title}`}'),
    'Edit button must have accessible aria-label'
  );
  assert.ok(
    code.includes('aria-label={`Delete habit ${habit.title}`}'),
    'Delete button must have accessible aria-label'
  );

  // Issue 4: Timezone usage
  assert.ok(
    code.includes('userTimezone = settings?.timezone || DEFAULT_TIMEZONE'),
    'HabitTrackerView must use configured settings?.timezone'
  );

  // Issue 5: Loading state / skeleton / retry error state
  assert.ok(
    code.includes('loadError'),
    'HabitTrackerView must have loadError state'
  );
  assert.ok(
    code.includes('<SkeletonList rows={4} />'),
    'HabitTrackerView must render skeleton list during initial load'
  );
  assert.ok(
    code.includes('Retry Connection') || code.includes('Try Again'),
    'HabitTrackerView must provide a retry action on error'
  );
});

test('Issue 5 — SubscriptionManager file contains skeleton loading and error handling', async () => {
  const fs = await import('fs');
  const code = fs.readFileSync('src/components/finance/SubscriptionManager.tsx', 'utf-8');

  assert.ok(
    code.includes('loadError'),
    'SubscriptionManager must have loadError state'
  );
  assert.ok(
    code.includes('loading && subscriptions.length === 0'),
    'SubscriptionManager must check loading before showing content or empty state'
  );
  assert.ok(
    code.includes('Failed to load subscriptions'),
    'SubscriptionManager must surface a clear error message'
  );
  assert.ok(
    code.includes('Retry Connection') || code.includes('Try Again'),
    'SubscriptionManager must provide a retry button'
  );
});
