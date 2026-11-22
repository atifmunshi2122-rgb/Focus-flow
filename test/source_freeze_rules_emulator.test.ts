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
    } else if (typeof v === 'object') {
      fields[k] = { mapValue: { fields: toFirestoreFields(v) } };
    }
  }
  return fields;
}

const PROJECT_ID = 'test-freeze-project';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE_URL = `http://${HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Helper to generate mock Firebase ID token for the emulator
function getAuthToken(uid: string, email?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      aud: PROJECT_ID,
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      email: email || `${uid}@example.com`,
      email_verified: true,
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
    useAdmin?: boolean;
    data?: Record<string, any>;
  } = {}
): Promise<{ status: number; data: any }> {
  const url = `${BASE_URL}/${docPath}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.useAdmin) {
    headers['Authorization'] = 'Bearer owner';
  } else if (options.uid) {
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
  ? 'Live Firestore emulator host not detected (run via firebase emulators:exec)'
  : false;

// Canonical 5 Users from Source Database
const USER_1 = 'AAjxV00m8zcUFB1gwyPlvKqJfsF2';
const USER_2 = 'MgJFbPGlqmc9YCXravUjaSFYu2z2';
const USER_3 = 'qMEx2eXnahelAjbBqNCo4rmSI0B2';
const USER_4 = 'ulExgQM9Y5gMaOrjLfGk0FdzARm1';
const USER_5 = 'wrl4anBq9MQme75LQkgp0Lfly4l2';
const SHARED_VAULT_ID = 'vlt_1794905820679_7sjukb';

test('Source Read-Only Freeze — Setup Initial Fixtures via Admin Bypassing Rules', { skip: skipReason }, async () => {
  // Pre-seed User Root Profiles
  for (const uid of [USER_1, USER_2, USER_3, USER_4, USER_5]) {
    const res = await firestoreRequest(`users/${uid}`, 'PATCH', {
      useAdmin: true,
      data: { id: uid, email: `${uid}@test.com`, name: `User ${uid.slice(0, 5)}` },
    });
    assert.equal(res.status, 200, `Admin pre-seed of users/${uid} must succeed`);
  }

  // Pre-seed User Subcollection Documents
  const seedDocs = [
    { path: `users/${USER_1}/focus_sessions/foc_test_1`, data: { userId: USER_1, status: 'completed' } },
    { path: `users/${USER_1}/settings/user_prefs`, data: { theme: 'dark', userId: USER_1 } },
    { path: `users/${USER_2}/expenses/exp_test_1`, data: { userId: USER_2, amountPaise: 50000 } },
    { path: `users/${USER_2}/sheet_connections/conn_test_1`, data: { userId: USER_2, title: 'Test Sheet' } },
    { path: `users/${USER_4}/study_mistakes/mis_test_1`, data: { userId: USER_4, topic: 'Integration' } },
    { path: `users/${USER_5}/study_topics/top_test_1`, data: { userId: USER_5, subtopic: 'Limits' } },
    // Pre-seed Shared Vault with USER_1 and USER_2 as members
    {
      path: `sharedVaults/${SHARED_VAULT_ID}`,
      data: {
        id: SHARED_VAULT_ID,
        name: 'Shared Family Vault',
        memberUids: [USER_1, USER_2],
        status: 'active',
      },
    },
    {
      path: `sharedVaults/${SHARED_VAULT_ID}/members/${USER_1}`,
      data: { uid: USER_1, role: 'creator', status: 'active' },
    },
    {
      path: `sharedVaults/${SHARED_VAULT_ID}/members/${USER_2}`,
      data: { uid: USER_2, role: 'member', status: 'active' },
    },
    {
      path: `sharedVaults/${SHARED_VAULT_ID}/activity/act_test_1`,
      data: { vaultId: SHARED_VAULT_ID, title: 'Contribution', actorUid: USER_1 },
    },
    // Pre-seed Idempotency record owned by USER_1
    {
      path: `driveIdempotency/op_freeze_test_1`,
      data: { operationId: 'op_freeze_test_1', ownerUid: USER_1, status: 'COMPLETED' },
    },
  ];

  for (const doc of seedDocs) {
    const res = await firestoreRequest(doc.path, 'PATCH', {
      useAdmin: true,
      data: doc.data,
    });
    assert.equal(res.status, 200, `Admin pre-seed of ${doc.path} must succeed`);
  }
});

test('Source Read-Only Freeze — Scenario A: Authorized Private Reads Succeed (200 OK)', { skip: skipReason }, async () => {
  // 1. User 1 reads own profile & subcollections
  const u1Prof = await firestoreRequest(`users/${USER_1}`, 'GET', { uid: USER_1 });
  assert.equal(u1Prof.status, 200, 'User 1 reads own profile');
  const u1Foc = await firestoreRequest(`users/${USER_1}/focus_sessions/foc_test_1`, 'GET', { uid: USER_1 });
  assert.equal(u1Foc.status, 200, 'User 1 reads own focus session');
  const u1Set = await firestoreRequest(`users/${USER_1}/settings/user_prefs`, 'GET', { uid: USER_1 });
  assert.equal(u1Set.status, 200, 'User 1 reads own settings');

  // 2. User 2 reads own profile & subcollections
  const u2Prof = await firestoreRequest(`users/${USER_2}`, 'GET', { uid: USER_2 });
  assert.equal(u2Prof.status, 200, 'User 2 reads own profile');
  const u2Exp = await firestoreRequest(`users/${USER_2}/expenses/exp_test_1`, 'GET', { uid: USER_2 });
  assert.equal(u2Exp.status, 200, 'User 2 reads own expense');
  const u2Conn = await firestoreRequest(`users/${USER_2}/sheet_connections/conn_test_1`, 'GET', { uid: USER_2 });
  assert.equal(u2Conn.status, 200, 'User 2 reads own sheet connection');

  // 3. User 4 reads own study mistakes
  const u4Mis = await firestoreRequest(`users/${USER_4}/study_mistakes/mis_test_1`, 'GET', { uid: USER_4 });
  assert.equal(u4Mis.status, 200, 'User 4 reads own study mistake');

  // 4. User 5 reads own study topics
  const u5Top = await firestoreRequest(`users/${USER_5}/study_topics/top_test_1`, 'GET', { uid: USER_5 });
  assert.equal(u5Top.status, 200, 'User 5 reads own study topic');

  // 5. Vault Members (User 1 & User 2) read shared vault & activity
  const u1Vault = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}`, 'GET', { uid: USER_1 });
  assert.equal(u1Vault.status, 200, 'Member User 1 reads shared vault');
  const u2Vault = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}`, 'GET', { uid: USER_2 });
  assert.equal(u2Vault.status, 200, 'Member User 2 reads shared vault');
  const u1Act = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}/activity/act_test_1`, 'GET', { uid: USER_1 });
  assert.equal(u1Act.status, 200, 'Member User 1 reads shared vault activity');

  // 6. Owner reads own driveIdempotency record
  const u1Idem = await firestoreRequest(`driveIdempotency/op_freeze_test_1`, 'GET', { uid: USER_1 });
  assert.equal(u1Idem.status, 200, 'Owner User 1 reads own idempotency record');
});

test('Source Read-Only Freeze — Scenario B: Cross-User and Unauthorized Reads DENIED (403 Forbidden)', { skip: skipReason }, async () => {
  // 1. User 1 cannot read User 2 documents
  const u1ReadsU2Exp = await firestoreRequest(`users/${USER_2}/expenses/exp_test_1`, 'GET', { uid: USER_1 });
  assert.equal(u1ReadsU2Exp.status, 403, 'Cross-user read: User 1 reading User 2 expense must be denied');

  const u1ReadsU2Prof = await firestoreRequest(`users/${USER_2}`, 'GET', { uid: USER_1 });
  assert.equal(u1ReadsU2Prof.status, 403, 'Cross-user read: User 1 reading User 2 profile must be denied');

  // 2. User 2 cannot read User 1 documents
  const u2ReadsU1Foc = await firestoreRequest(`users/${USER_1}/focus_sessions/foc_test_1`, 'GET', { uid: USER_2 });
  assert.equal(u2ReadsU1Foc.status, 403, 'Cross-user read: User 2 reading User 1 focus session must be denied');

  // 3. Unauthenticated reads are strictly denied
  const unauthU1 = await firestoreRequest(`users/${USER_1}/focus_sessions/foc_test_1`, 'GET');
  assert.equal(unauthU1.status, 403, 'Unauthenticated read to user subcollection must be denied');

  const unauthVault = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}`, 'GET');
  assert.equal(unauthVault.status, 403, 'Unauthenticated read to shared vault must be denied');

  // 4. Non-member (User 4 & User 5) cannot read shared vault
  const u4Vault = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}`, 'GET', { uid: USER_4 });
  assert.equal(u4Vault.status, 403, 'Non-member User 4 reading shared vault must be denied');

  const u5Vault = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}/activity/act_test_1`, 'GET', { uid: USER_5 });
  assert.equal(u5Vault.status, 403, 'Non-member User 5 reading shared vault activity must be denied');

  // 5. Cross-user read of driveIdempotency record is denied
  const u2ReadsU1Idem = await firestoreRequest(`driveIdempotency/op_freeze_test_1`, 'GET', { uid: USER_2 });
  assert.equal(u2ReadsU1Idem.status, 403, 'User 2 reading User 1 idempotency record must be denied');

  // 6. Enumeration of vaultInvitations is blocked
  const enumInv = await firestoreRequest(`vaultInvitations`, 'GET', { uid: USER_1 });
  assert.equal(enumInv.status, 403, 'Enumeration of vaultInvitations collection must be denied');
});

test('Source Read-Only Freeze — Scenario C: ALL Client Writes DENIED (403 Forbidden)', { skip: skipReason }, async () => {
  // 1. Document CREATE (new subcollection document) by owner is DENIED
  const createExp = await firestoreRequest(`users/${USER_1}/expenses/exp_new_blocked`, 'PATCH', {
    uid: USER_1,
    data: { id: 'exp_new_blocked', userId: USER_1, amountPaise: 10000 },
  });
  assert.equal(createExp.status, 403, 'Owner document creation must be DENIED under freeze');

  // 2. Document UPDATE (existing document) by owner is DENIED
  const updateFoc = await firestoreRequest(`users/${USER_1}/focus_sessions/foc_test_1`, 'PATCH', {
    uid: USER_1,
    data: { status: 'interrupted' },
  });
  assert.equal(updateFoc.status, 403, 'Owner document update must be DENIED under freeze');

  // 3. Document DELETE by owner is DENIED
  const deleteSet = await firestoreRequest(`users/${USER_1}/settings/user_prefs`, 'DELETE', {
    uid: USER_1,
  });
  assert.equal(deleteSet.status, 403, 'Owner document delete must be DENIED under freeze');

  // 4. Subcollection WRITE (interruptions) by owner is DENIED
  const writeInt = await firestoreRequest(`users/${USER_1}/focus_sessions/foc_test_1/interruptions/int_new`, 'PATCH', {
    uid: USER_1,
    data: { userId: USER_1, sessionId: 'foc_test_1', eventType: 'pause' },
  });
  assert.equal(writeInt.status, 403, 'Nested subcollection write must be DENIED under freeze');

  // 5. Shared Vault CREATE by authenticated user is DENIED
  const createVault = await firestoreRequest(`sharedVaults/vlt_new_blocked`, 'PATCH', {
    uid: USER_1,
    data: { id: 'vlt_new_blocked', name: 'New Vault', memberUids: [USER_1] },
  });
  assert.equal(createVault.status, 403, 'Shared vault create must be DENIED under freeze');

  // 6. Shared Vault UPDATE by active member is DENIED
  const updateVault = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}`, 'PATCH', {
    uid: USER_1,
    data: { name: 'Renamed Vault' },
  });
  assert.equal(updateVault.status, 403, 'Shared vault update by member must be DENIED under freeze');

  // 7. Shared Vault Member write (join / leave) is DENIED
  const writeMember = await firestoreRequest(`sharedVaults/${SHARED_VAULT_ID}/members/${USER_3}`, 'PATCH', {
    uid: USER_3,
    data: { uid: USER_3, role: 'member', status: 'active' },
  });
  assert.equal(writeMember.status, 403, 'Vault member join/write must be DENIED under freeze');

  // 8. User Root Profile UPDATE is DENIED
  const updateProf = await firestoreRequest(`users/${USER_1}`, 'PATCH', {
    uid: USER_1,
    data: { name: 'New Name' },
  });
  assert.equal(updateProf.status, 403, 'User root profile update must be DENIED under freeze');

  // 9. Sheet Connection WRITE is DENIED
  const writeConn = await firestoreRequest(`users/${USER_2}/sheet_connections/conn_new`, 'PATCH', {
    uid: USER_2,
    data: { id: 'conn_new', userId: USER_2, title: 'New Sheet' },
  });
  assert.equal(writeConn.status, 403, 'Sheet connection write must be DENIED under freeze');

  // 10. Sheet Sync Queue WRITE is DENIED
  const writeSync = await firestoreRequest(`users/${USER_2}/sheet_sync_queue/op_new`, 'PATCH', {
    uid: USER_2,
    data: { id: 'op_new', userId: USER_2, status: 'pending' },
  });
  assert.equal(writeSync.status, 403, 'Sheet sync queue write must be DENIED under freeze');

  // 11. Idempotency Record WRITE is DENIED
  const writeIdem = await firestoreRequest(`driveIdempotency/op_freeze_test_2`, 'PATCH', {
    uid: USER_1,
    data: { operationId: 'op_freeze_test_2', ownerUid: USER_1, status: 'PROCESSING' },
  });
  assert.equal(writeIdem.status, 403, 'Idempotency record client write must be DENIED under freeze');

  // 12. Unauthenticated write is DENIED
  const unauthWrite = await firestoreRequest(`users/${USER_1}/expenses/exp_unauth`, 'PATCH', {
    data: { amountPaise: 9999 },
  });
  assert.equal(unauthWrite.status, 403, 'Unauthenticated write must be DENIED under freeze');
});

