import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Helper to convert plain JS objects into Firestore REST v1 fields
function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null) {
      fields[k] = { nullValue: null };
    } else if (typeof v === 'string') {
      fields[k] = { stringValue: v };
    } else if (typeof v === 'boolean') {
      fields[k] = { booleanValue: v };
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        fields[k] = { integerValue: String(v) };
      } else {
        fields[k] = { doubleValue: v };
      }
    } else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map((item) => {
            if (typeof item === 'string') return { stringValue: item };
            if (typeof item === 'number') return { integerValue: String(item) };
            if (typeof item === 'boolean') return { booleanValue: item };
            return { stringValue: String(item) };
          }),
        },
      };
    }
  }
  return fields;
}

const PROJECT_ID = 'test-rules-project';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE_URL = `http://${HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Helper to generate mock Firebase ID token for the emulator
function getAuthToken(uid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      aud: PROJECT_ID,
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

// Client helper for Firestore REST calls
async function firestoreRequest(
  docPath: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  options: {
    uid?: string;
    data?: Record<string, any>;
    updateMask?: string[];
  } = {}
): Promise<{ status: number; data: any }> {
  let url = `${BASE_URL}/${docPath}`;
  if (options.updateMask && options.updateMask.length > 0) {
    const maskParams = options.updateMask.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join('&');
    url += `?${maskParams}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.uid) {
    headers['Authorization'] = `Bearer ${getAuthToken(options.uid)}`;
  }

  const reqOptions: RequestInit = {
    method,
    headers,
  };
  if (options.data && (method === 'POST' || method === 'PATCH')) {
    reqOptions.body = JSON.stringify({ fields: toFirestoreFields(options.data) });
  }

  const res = await fetch(url, reqOptions);
  let resJson: any = null;
  try {
    resJson = await res.json();
  } catch {
    resJson = null;
  }
  return { status: res.status, data: resJson };
}

const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const skipReason = !isEmulatorRunning
  ? 'Live Firestore emulator host not detected (run via npm run test:rules)'
  : false;

// ---------------------------------------------------------------------
// TEST SUITE: LIVE FIRESTORE RULES VALIDATION AGAINST LOCAL EMULATOR
// ---------------------------------------------------------------------

test('1. Default-Deny & System Documents', { skip: skipReason }, async () => {
  // Unauthenticated write to unknown collection -> 403
  const res1 = await firestoreRequest('unknown_coll/doc1', 'PATCH', {
    data: { test: 'val' },
  });
  assert.equal(res1.status, 403, 'Unauthenticated write to arbitrary collection must be denied');

  // Authenticated write to unknown collection -> 403
  const res2 = await firestoreRequest('unknown_coll/doc1', 'PATCH', {
    uid: 'user_alice',
    data: { test: 'val' },
  });
  assert.equal(res2.status, 403, 'Authenticated write to unknown collection must be denied by default-deny');

  // Health-check /test/connection doc allows read
  const res3 = await firestoreRequest('test/connection', 'GET');
  assert.notEqual(res3.status, 403, '/test/connection read must NOT be permission denied (403)');

  // Health-check /test/connection doc denies write
  const res4 = await firestoreRequest('test/connection', 'PATCH', {
    uid: 'user_alice',
    data: { ping: 'pong' },
  });
  assert.equal(res4.status, 403, '/test/connection write must be denied');
});

test('2. User Root Document (/users/{userId}) Validation & Protection', { skip: skipReason }, async () => {
  const aliceId = 'usr_alice_' + Date.now();
  const bobId = 'usr_bob_' + Date.now();

  // A. Unauthenticated read/create -> 403
  const unauthRead = await firestoreRequest(`users/${aliceId}`, 'GET');
  assert.equal(unauthRead.status, 403, 'Unauthenticated read to user profile must be denied');

  // B. Bob cannot create Alice profile
  const bobCreatesAlice = await firestoreRequest(`users/${aliceId}`, 'PATCH', {
    uid: bobId,
    data: { id: aliceId, email: 'alice@test.com', name: 'Alice' },
  });
  assert.equal(bobCreatesAlice.status, 403, 'Bob cannot create Alice profile');

  // C. Alice creates own profile with valid fields -> 200
  const aliceCreate = await firestoreRequest(`users/${aliceId}`, 'PATCH', {
    uid: aliceId,
    data: { id: aliceId, email: 'alice@test.com', name: 'Alice Smith' },
  });
  assert.equal(aliceCreate.status, 200, 'Alice creates own profile successfully');

  // D. Bob cannot read Alice profile -> 403
  const bobReadsAlice = await firestoreRequest(`users/${aliceId}`, 'GET', { uid: bobId });
  assert.equal(bobReadsAlice.status, 403, 'Bob cannot read Alice profile');

  // E. Alice reads own profile -> 200
  const aliceReadsAlice = await firestoreRequest(`users/${aliceId}`, 'GET', { uid: aliceId });
  assert.equal(aliceReadsAlice.status, 200, 'Alice can read own profile');

  // F. User root profile cannot be deleted (allow delete: if false;) -> 403
  const aliceDelete = await firestoreRequest(`users/${aliceId}`, 'DELETE', { uid: aliceId });
  assert.equal(aliceDelete.status, 403, 'User root profile delete must be strictly forbidden');
});

test('3. Habits Subcollection (/users/{userId}/habits/{habitId}) Rules & Immutability', { skip: skipReason }, async () => {
  const uid = 'usr_habit_test_' + Date.now();
  const otherUid = 'usr_other_' + Date.now();
  const habitId = 'habit_gym_1';

  // Create user profile first
  await firestoreRequest(`users/${uid}`, 'PATCH', {
    uid,
    data: { id: uid, email: 'habit@test.com', name: 'Habit User' },
  });

  // A. Create valid habit -> 200
  const createValid = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'PATCH', {
    uid,
    data: {
      id: habitId,
      userId: uid,
      title: 'Morning Gym Workout',
      frequency: 'daily',
      targetDaysPerWeek: 5,
      createdAt: '2026-11-14T08:00:00Z',
    },
  });
  assert.equal(createValid.status, 200, 'Valid habit creation must succeed');

  // B. Cross-user access: otherUid cannot read or write
  const otherRead = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'GET', { uid: otherUid });
  assert.equal(otherRead.status, 403, 'Other user cannot read habit');

  const otherWrite = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'PATCH', {
    uid: otherUid,
    data: { title: 'Hacked Title' },
    updateMask: ['title'],
  });
  assert.equal(otherWrite.status, 403, 'Other user cannot write to habit');

  // C. Update with allowed field (title, targetDaysPerWeek) -> 200
  const updateValid = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'PATCH', {
    uid,
    data: {
      userId: uid,
      title: 'Evening Gym Workout',
      frequency: 'daily',
      targetDaysPerWeek: 6,
      updatedAt: '2026-11-14T09:00:00Z',
    },
    updateMask: ['title', 'targetDaysPerWeek', 'updatedAt'],
  });
  assert.equal(updateValid.status, 200, 'Updating whitelisted habit fields must succeed');

  // D. Prohibited field update: injecting unwhitelisted property -> 403
  const updateProhibited = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'PATCH', {
    uid,
    data: {
      isSuperAdmin: true,
      updatedAt: '2026-11-14T09:05:00Z',
    },
    updateMask: ['isSuperAdmin', 'updatedAt'],
  });
  assert.equal(updateProhibited.status, 403, 'Injecting unwhitelisted field into habit must be rejected');

  // E. Ownership re-assignment: attempting to modify userId on update -> 403
  const reassignOwner = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'PATCH', {
    uid,
    data: {
      userId: otherUid,
      title: 'Stolen Habit',
    },
    updateMask: ['userId', 'title'],
  });
  assert.equal(reassignOwner.status, 403, 'Reassigning userId on habit update must be rejected');

  // F. Soft-delete update with only deletedAt and updatedAt -> 200
  const softDeleteValid = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'PATCH', {
    uid,
    data: {
      deletedAt: '2026-11-14T10:00:00Z',
      updatedAt: '2026-11-14T10:00:00Z',
    },
    updateMask: ['deletedAt', 'updatedAt'],
  });
  assert.equal(softDeleteValid.status, 200, 'Soft delete with only deletedAt/updatedAt must succeed');

  // G. Soft-delete bypass attempt: injecting prohibited field along with deletedAt -> 403
  const softDeleteBypass = await firestoreRequest(`users/${uid}/habits/${habitId}`, 'PATCH', {
    uid,
    data: {
      deletedAt: '2026-11-14T10:05:00Z',
      unknownField: 'Bypass Attempt',
    },
    updateMask: ['deletedAt', 'unknownField'],
  });
  assert.equal(softDeleteBypass.status, 403, 'Injecting unwhitelisted field along with deletedAt must be rejected');
});

test('4. Study Subjects (/users/{userId}/study_subjects/{subId}) Rules & Code Immutability', { skip: skipReason }, async () => {
  const uid = 'usr_subj_test_' + Date.now();
  const subId = 'subj_cs101_test';

  await firestoreRequest(`users/${uid}`, 'PATCH', {
    uid,
    data: { id: uid, email: 'subject@test.com', name: 'Subject User' },
  });

  // A. Create valid subject -> 200
  const createSub = await firestoreRequest(`users/${uid}/study_subjects/${subId}`, 'PATCH', {
    uid,
    data: {
      id: subId,
      userId: uid,
      code: 'CS101',
      name: 'Introduction to Computer Science',
      tierId: 'tier1_sem3',
      totalSubtopics: 10,
      completedSubtopics: 0,
      color: '#3b82f6',
    },
  });
  assert.equal(createSub.status, 200, 'Creating study subject must succeed');

  // B. Update allowed field (name, completedSubtopics) -> 200
  const updateSub = await firestoreRequest(`users/${uid}/study_subjects/${subId}`, 'PATCH', {
    uid,
    data: {
      name: 'Advanced CS101',
      completedSubtopics: 4,
      updatedAt: '2026-11-14T10:00:00Z',
    },
    updateMask: ['name', 'completedSubtopics', 'updatedAt'],
  });
  assert.equal(updateSub.status, 200, 'Updating whitelisted subject fields must succeed');

  // C. Immutable relational field: attempting to modify subject code -> 403
  const mutateCode = await firestoreRequest(`users/${uid}/study_subjects/${subId}`, 'PATCH', {
    uid,
    data: {
      code: 'CS999_CHANGED',
      name: 'Advanced CS101',
    },
    updateMask: ['code', 'name'],
  });
  assert.equal(mutateCode.status, 403, 'Subject code must be immutable on update');

  // D. Immutable ownership: attempting to modify userId -> 403
  const mutateUser = await firestoreRequest(`users/${uid}/study_subjects/${subId}`, 'PATCH', {
    uid,
    data: {
      userId: 'usr_imposter',
      name: 'Advanced CS101',
    },
    updateMask: ['userId', 'name'],
  });
  assert.equal(mutateUser.status, 403, 'Subject userId must be immutable on update');
});

test('5. Study Topics (/users/{userId}/study_topics/{topicId}) Rules & Type Validation', { skip: skipReason }, async () => {
  const uid = 'usr_top_test_' + Date.now();
  const topicId = 'topic_algo_1';

  await firestoreRequest(`users/${uid}`, 'PATCH', {
    uid,
    data: { id: uid, email: 'topic@test.com', name: 'Topic User' },
  });

  // A. Create valid topic -> 200
  const createTopic = await firestoreRequest(`users/${uid}/study_topics/${topicId}`, 'PATCH', {
    uid,
    data: {
      id: topicId,
      userId: uid,
      subjectCode: 'CS101',
      unit: 'Unit 1: Fundamentals',
      subtopic: 'Asymptotic Notation',
      topic: 'Big-O',
      priority: 'High',
      theory: true,
      practice: false,
      pyq: false,
      rowIndex: 1,
    },
  });
  assert.equal(createTopic.status, 200, 'Creating study topic must succeed');

  // B. Update with valid boolean flags and priority -> 200
  const updateTopic = await firestoreRequest(`users/${uid}/study_topics/${topicId}`, 'PATCH', {
    uid,
    data: {
      priority: 'Medium',
      theory: true,
      practice: true,
      pyq: true,
      revisionCount: 2,
      updatedAt: '2026-11-14T11:00:00Z',
    },
    updateMask: ['priority', 'theory', 'practice', 'pyq', 'revisionCount', 'updatedAt'],
  });
  assert.equal(updateTopic.status, 200, 'Updating topic with valid types must succeed');

  // C. Immutable relational field: subjectCode cannot be changed -> 403
  const mutateSubjectCode = await firestoreRequest(`users/${uid}/study_topics/${topicId}`, 'PATCH', {
    uid,
    data: {
      subjectCode: 'MATH101',
      priority: 'Medium',
    },
    updateMask: ['subjectCode', 'priority'],
  });
  assert.equal(mutateSubjectCode.status, 403, 'Topic subjectCode must be immutable');

  // D. Invalid enum value for priority -> 403
  const invalidPriority = await firestoreRequest(`users/${uid}/study_topics/${topicId}`, 'PATCH', {
    uid,
    data: {
      priority: 'CRITICAL_URGENT',
    },
    updateMask: ['priority'],
  });
  assert.equal(invalidPriority.status, 403, 'Invalid priority enum must be rejected');

  // E. Invalid type for boolean flag (passing string instead of bool) -> 403
  const invalidType = await firestoreRequest(`users/${uid}/study_topics/${topicId}`, 'PATCH', {
    uid,
    data: {
      theory: 'not_a_boolean',
      priority: 'Medium',
    },
    updateMask: ['theory', 'priority'],
  });
  assert.equal(invalidType.status, 403, 'Non-boolean for theory flag must be rejected');
});

test('6. Study Revisions (/users/{userId}/study_revisions/{revId}) Rules & Topic Link Immutability', { skip: skipReason }, async () => {
  const uid = 'usr_rev_test_' + Date.now();
  const revId = 'rev_ebbinghaus_1';

  await firestoreRequest(`users/${uid}`, 'PATCH', {
    uid,
    data: { id: uid, email: 'rev@test.com', name: 'Rev User' },
  });

  // A. Create valid revision -> 200
  const createRev = await firestoreRequest(`users/${uid}/study_revisions/${revId}`, 'PATCH', {
    uid,
    data: {
      id: revId,
      userId: uid,
      topicId: 'topic_algo_1',
      lastStudiedAt: '2026-11-14',
      nextRevisionAt: '2026-11-17',
      difficulty: 'medium',
      status: 'scheduled',
      repetition: 1,
      intervalDays: 3,
    },
  });
  assert.equal(createRev.status, 200, 'Creating study revision must succeed');

  // B. Update allowed status and difficulty -> 200
  const updateRev = await firestoreRequest(`users/${uid}/study_revisions/${revId}`, 'PATCH', {
    uid,
    data: {
      difficulty: 'easy',
      status: 'mastered',
      nextRevisionAt: '2026-11-25',
      intervalDays: 7,
      updatedAt: '2026-11-14T11:30:00Z',
    },
    updateMask: ['difficulty', 'status', 'nextRevisionAt', 'intervalDays', 'updatedAt'],
  });
  assert.equal(updateRev.status, 200, 'Updating revision fields must succeed');

  // C. Immutable topicId: topic link cannot be reassigned -> 403
  const mutateTopicId = await firestoreRequest(`users/${uid}/study_revisions/${revId}`, 'PATCH', {
    uid,
    data: {
      topicId: 'topic_another_99',
      difficulty: 'easy',
    },
    updateMask: ['topicId', 'difficulty'],
  });
  assert.equal(mutateTopicId.status, 403, 'Revision topicId must be immutable');
});

test('7. Study Mistakes (/users/{userId}/study_mistakes/{mistakeId}) Rules & Trap Validation', { skip: skipReason }, async () => {
  const uid = 'usr_mistake_test_' + Date.now();
  const mistakeId = 'mistake_off_by_one';

  await firestoreRequest(`users/${uid}`, 'PATCH', {
    uid,
    data: { id: uid, email: 'mistake@test.com', name: 'Mistake User' },
  });

  // A. Create valid mistake -> 200
  const createMistake = await firestoreRequest(`users/${uid}/study_mistakes/${mistakeId}`, 'PATCH', {
    uid,
    data: {
      id: mistakeId,
      userId: uid,
      date: '2026-11-14',
      trap: 'Off-by-one boundary in binary search',
      goldenRule: 'Check while (low <= high) condition carefully',
      severity: 'High',
      resolved: false,
    },
  });
  assert.equal(createMistake.status, 200, 'Creating study mistake must succeed');

  // B. Update severity and resolved status -> 200
  const updateMistake = await firestoreRequest(`users/${uid}/study_mistakes/${mistakeId}`, 'PATCH', {
    uid,
    data: {
      resolved: true,
      severity: 'Low',
      updatedAt: '2026-11-14T12:00:00Z',
    },
    updateMask: ['resolved', 'severity', 'updatedAt'],
  });
  assert.equal(updateMistake.status, 200, 'Updating mistake status must succeed');

  // C. Immutable userId -> 403
  const mutateUser = await firestoreRequest(`users/${uid}/study_mistakes/${mistakeId}`, 'PATCH', {
    uid,
    data: {
      userId: 'usr_hacker',
      severity: 'Low',
    },
    updateMask: ['userId', 'severity'],
  });
  assert.equal(mutateUser.status, 403, 'Mistake userId must be immutable on update');
});

test('8. Legacy Collections Compatibility (tasks, expenses, bills, envelopes, audit_logs)', { skip: skipReason }, async () => {
  const uid = 'usr_legacy_test_' + Date.now();
  const otherUid = 'usr_other_legacy_' + Date.now();

  await firestoreRequest(`users/${uid}`, 'PATCH', {
    uid,
    data: { id: uid, email: 'legacy@test.com', name: 'Legacy User' },
  });

  // A. Tasks: Create and update
  const taskId = 'task_review_1';
  const createTask = await firestoreRequest(`users/${uid}/tasks/${taskId}`, 'PATCH', {
    uid,
    data: {
      id: taskId,
      userId: uid,
      title: 'Review Production Code',
      priority: 'high',
      status: 'todo',
      estimatedPomodoros: 3,
    },
  });
  assert.equal(createTask.status, 200, 'Legacy task creation must succeed');

  const otherReadTask = await firestoreRequest(`users/${uid}/tasks/${taskId}`, 'GET', { uid: otherUid });
  assert.equal(otherReadTask.status, 403, 'Cross-user task read must be denied');

  // B. Expenses: Positive paise enforced
  const expId = 'exp_lunch_1';
  const createExpValid = await firestoreRequest(`users/${uid}/expenses/${expId}`, 'PATCH', {
    uid,
    data: {
      id: expId,
      userId: uid,
      description: 'Business Lunch',
      amountPaise: 45000,
      date: '2026-11-14',
      type: 'variable',
      paymentMethod: 'upi_bank',
    },
  });
  assert.equal(createExpValid.status, 200, 'Valid expense creation must succeed');

  const createExpNegative = await firestoreRequest(`users/${uid}/expenses/exp_neg_1`, 'PATCH', {
    uid,
    data: {
      id: 'exp_neg_1',
      userId: uid,
      description: 'Negative Expense',
      amountPaise: -5000,
      date: '2026-11-14',
      type: 'variable',
      paymentMethod: 'upi_bank',
    },
  });
  assert.equal(createExpNegative.status, 403, 'Negative amountPaise must be rejected by isPositivePaise');

  // C. Bills: Status enum enforced
  const billId = 'bill_wifi_1';
  const createBillValid = await firestoreRequest(`users/${uid}/bills/${billId}`, 'PATCH', {
    uid,
    data: {
      id: billId,
      userId: uid,
      name: 'Fiber Internet Bill',
      amountPaise: 99900,
      dueDate: '2026-11-20',
      status: 'UNPAID',
    },
  });
  assert.equal(createBillValid.status, 200, 'Valid bill creation must succeed');

  const createBillInvalidStatus = await firestoreRequest(`users/${uid}/bills/bill_bad_1`, 'PATCH', {
    uid,
    data: {
      id: 'bill_bad_1',
      userId: uid,
      name: 'Bad Bill',
      amountPaise: 50000,
      dueDate: '2026-11-20',
      status: 'PENDING_REVIEW', // Not in PAID/UNPAID/OVERDUE
    },
  });
  assert.equal(createBillInvalidStatus.status, 403, 'Bill with invalid status enum must be rejected');

  // D. Envelopes: Non-negative paise enforced
  const envId = 'env_groceries_1';
  const createEnv = await firestoreRequest(`users/${uid}/envelopes/${envId}`, 'PATCH', {
    uid,
    data: {
      id: envId,
      userId: uid,
      name: 'Groceries',
      allocatedPaise: 250000,
    },
  });
  assert.equal(createEnv.status, 200, 'Envelope creation must succeed');

  // E. Audit Logs: Append-only enforcement (allow update: if false;)
  const logId = 'log_login_1';
  const createAuditLog = await firestoreRequest(`users/${uid}/audit_logs/${logId}`, 'PATCH', {
    uid,
    data: {
      id: logId,
      userId: uid,
      action: 'USER_LOGIN',
    },
  });
  assert.equal(createAuditLog.status, 200, 'Audit log append must succeed');

  const updateAuditLog = await firestoreRequest(`users/${uid}/audit_logs/${logId}`, 'PATCH', {
    uid,
    data: {
      action: 'ALTERED_ACTION',
    },
    updateMask: ['action'],
  });
  assert.equal(updateAuditLog.status, 403, 'Audit log modification must be strictly rejected (append-only)');
});

test('9. Boundary Limits, Length Bounds & Time-Block Constraints', { skip: skipReason }, async () => {
  const uid = 'usr_bounds_test_' + Date.now();

  await firestoreRequest(`users/${uid}`, 'PATCH', {
    uid,
    data: { id: uid, email: 'bounds@test.com', name: 'Bounds User' },
  });

  // A. Invalid Document ID format (spaces, slashes, or path traversal)
  const badIdRes = await firestoreRequest(`users/${uid}/habits/invalid%20id%20with%20spaces`, 'PATCH', {
    uid,
    data: {
      id: 'invalid id with spaces',
      userId: uid,
      title: 'Bad ID Habit',
      frequency: 'daily',
      targetDaysPerWeek: 3,
    },
  });
  assert.equal(badIdRes.status, 403, 'Document ID with invalid characters must be rejected by isValidId');

  // B. String length limit: subject name > 256 chars rejected
  const longName = 'A'.repeat(257);
  const badLengthRes = await firestoreRequest(`users/${uid}/study_subjects/subj_long_test`, 'PATCH', {
    uid,
    data: {
      id: 'subj_long_test',
      userId: uid,
      code: 'LONG101',
      name: longName,
    },
  });
  assert.equal(badLengthRes.status, 403, 'Subject name exceeding 256 characters must be rejected by isNonEmptyString');

  // C. Time-blocks: endMinute must be strictly greater than startMinute
  const invalidTimeBlock = await firestoreRequest(`users/${uid}/time_blocks/block_inverted`, 'PATCH', {
    uid,
    data: {
      id: 'block_inverted',
      userId: uid,
      date: '2026-11-14',
      title: 'Inverted Schedule',
      startMinute: 600, // 10:00 AM
      endMinute: 540,   // 09:00 AM (ends before it starts)
    },
  });
  assert.equal(invalidTimeBlock.status, 403, 'Time block where endMinute <= startMinute must be rejected');

  const validTimeBlock = await firestoreRequest(`users/${uid}/time_blocks/block_valid`, 'PATCH', {
    uid,
    data: {
      id: 'block_valid',
      userId: uid,
      date: '2026-11-14',
      title: 'Valid Schedule',
      startMinute: 540, // 09:00 AM
      endMinute: 600,   // 10:00 AM
    },
  });
  assert.equal(validTimeBlock.status, 200, 'Valid time block where endMinute > startMinute must succeed');
});
