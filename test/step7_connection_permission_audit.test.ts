import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'test-rules-project';
const hostPort = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const host = hostPort[0] || '127.0.0.1';
const port = parseInt(hostPort[1] || '8080', 10);

const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const skipReason = !isEmulatorRunning
  ? 'Live Firestore emulator host not detected (run via firebase emulators:exec --only firestore)'
  : false;

let testEnv: RulesTestEnvironment;

before(async () => {
  if (!isEmulatorRunning) return;
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host,
      port,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

// Helper to generate the exact normalized payload produced by Step 7 ConnectSheetWizard.tsx + sheetHubStore.ts
function makeStep7ConnectionDoc(userId: string, connId: string, syncMode: 'two_way' | 'sheet_to_app' = 'sheet_to_app') {
  const nowIso = new Date().toISOString();
  return {
    id: connId,
    userId: userId,
    ownerUid: userId,
    spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    title: 'Semester 3 Syllabus Tracker',
    templateHint: 'checklist',
    syncMode,
    pollIntervalSec: null,
    syncOnOpen: true,
    status: 'active',
    lastSyncedAt: nowIso,
    lastSuccessfulPullAt: nowIso,
    lastSuccessfulPushAt: null,
    lastError: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    tabOrder: [`${connId}__tab_1`, `${connId}__tab_2`],
    schemaVersion: 1,
    sortOrder: 0,
    isNative: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  };
}

test('1. Authenticated User A can create and read their own Step 7 connection in both sheets and sheet_connections', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const connId = 'conn_1BxiMVs0XRA5nFMdKvBdBZjgm_m01abc123';
  const docData = makeStep7ConnectionDoc(userA, connId, 'sheet_to_app');

  const aliceDb = testEnv.authenticatedContext(userA).firestore();

  // Write 1: Canonical path users/{userId}/sheets/{connId}
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), docData)
  );

  // Read 1: Canonical path
  const canonicalSnap = await assertSucceeds(
    getDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`))
  );
  assert.equal(canonicalSnap.exists(), true);
  assert.equal(canonicalSnap.data()?.title, 'Semester 3 Syllabus Tracker');

  // Write 2: Index path users/{userId}/sheet_connections/{connId}
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), docData)
  );

  // Read 2: Index path
  const indexSnap = await assertSucceeds(
    getDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`))
  );
  assert.equal(indexSnap.exists(), true);
});

test('2. Two-way sync mode connection creates and updates successfully for owner', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const connId = 'conn_two_way_456';
  const docData = makeStep7ConnectionDoc(userA, connId, 'two_way');

  const aliceDb = testEnv.authenticatedContext(userA).firestore();

  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), docData)
  );
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), docData)
  );

  // Update status to paused
  const updatedData = {
    ...docData,
    status: 'paused',
    updatedAt: new Date().toISOString(),
  };

  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), updatedData)
  );
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), updatedData)
  );
});

test('3. Cross-User Isolation — User B CANNOT read, create, update, or delete User A connections', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const userB = 'user_bob_456';
  const connId = 'conn_alice_secret';
  const docData = makeStep7ConnectionDoc(userA, connId, 'sheet_to_app');

  const aliceDb = testEnv.authenticatedContext(userA).firestore();
  const bobDb = testEnv.authenticatedContext(userB).firestore();

  // Alice creates her connection
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), docData)
  );
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), docData)
  );

  // Bob CANNOT read Alice's sheets or sheet_connections
  await assertFails(getDoc(doc(bobDb, `users/${userA}/sheets/${connId}`)));
  await assertFails(getDoc(doc(bobDb, `users/${userA}/sheet_connections/${connId}`)));

  // Bob CANNOT update Alice's sheets or sheet_connections
  await assertFails(
    setDoc(doc(bobDb, `users/${userA}/sheets/${connId}`), { ...docData, title: 'Hacked by Bob' })
  );
  await assertFails(
    setDoc(doc(bobDb, `users/${userA}/sheet_connections/${connId}`), { ...docData, title: 'Hacked by Bob' })
  );

  // Bob CANNOT delete Alice's sheets or sheet_connections
  await assertFails(deleteDoc(doc(bobDb, `users/${userA}/sheets/${connId}`)));
  await assertFails(deleteDoc(doc(bobDb, `users/${userA}/sheet_connections/${connId}`)));

  // Bob CANNOT create documents in Alice's namespace
  await assertFails(
    setDoc(doc(bobDb, `users/${userA}/sheets/conn_bob_intruder`), makeStep7ConnectionDoc(userA, 'conn_bob_intruder'))
  );
  await assertFails(
    setDoc(doc(bobDb, `users/${userA}/sheet_connections/conn_bob_intruder`), makeStep7ConnectionDoc(userA, 'conn_bob_intruder'))
  );
});

test('4. Unauthenticated Access — Rejected for all reads, creates, updates, and deletes', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const connId = 'conn_unauth_test';
  const docData = makeStep7ConnectionDoc(userA, connId, 'sheet_to_app');

  const unauthDb = testEnv.unauthenticatedContext().firestore();

  await assertFails(getDoc(doc(unauthDb, `users/${userA}/sheets/${connId}`)));
  await assertFails(getDoc(doc(unauthDb, `users/${userA}/sheet_connections/${connId}`)));

  await assertFails(setDoc(doc(unauthDb, `users/${userA}/sheets/${connId}`), docData));
  await assertFails(setDoc(doc(unauthDb, `users/${userA}/sheet_connections/${connId}`), docData));

  await assertFails(deleteDoc(doc(unauthDb, `users/${userA}/sheets/${connId}`)));
  await assertFails(deleteDoc(doc(unauthDb, `users/${userA}/sheet_connections/${connId}`)));
});

test('5. Anti-Spoofing — User A cannot create a document with mismatched userId or ownerUid', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const userB = 'user_bob_456';
  const connId = 'conn_spoof_attempt';

  const aliceDb = testEnv.authenticatedContext(userA).firestore();

  // Mismatched userId in payload
  const spoofedUserId = {
    ...makeStep7ConnectionDoc(userA, connId),
    userId: userB,
  };
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), spoofedUserId));
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), spoofedUserId));

  // Mismatched ownerUid in payload
  const spoofedOwnerUid = {
    ...makeStep7ConnectionDoc(userA, connId),
    ownerUid: userB,
  };
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), spoofedOwnerUid));
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), spoofedOwnerUid));
});

test('6. OAuth token fields — Rejected if accessToken or refreshToken are present', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const connId = 'conn_token_leak';

  const aliceDb = testEnv.authenticatedContext(userA).firestore();

  const withAccessToken = {
    ...makeStep7ConnectionDoc(userA, connId),
    accessToken: 'ya29.secret_token',
  };
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), withAccessToken));
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), withAccessToken));

  const withRefreshToken = {
    ...makeStep7ConnectionDoc(userA, connId),
    refreshToken: '1//refresh_token',
  };
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), withRefreshToken));
  await assertFails(setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), withRefreshToken));
});

test('7. New fields — writeMode, writeAuthStatus, writeAuthorizedAt validation', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const connId = 'conn_write_status_test';

  const aliceDb = testEnv.authenticatedContext(userA).firestore();

  const docWithValidNewFields = {
    ...makeStep7ConnectionDoc(userA, connId, 'two_way'),
    writeMode: 'native_oauth',
    writeAuthStatus: 'authorized',
    writeAuthorizedAt: new Date().toISOString(),
  };

  // Valid Native OAuth tracking fields must SUCCEED for owner
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), docWithValidNewFields)
  );
  await assertSucceeds(
    setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), docWithValidNewFields)
  );

  // Invalid writeMode enum value must FAIL
  const docWithInvalidMode = {
    ...docWithValidNewFields,
    writeMode: 'unauthorized_hack_mode',
  };
  await assertFails(
    setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), docWithInvalidMode)
  );
  await assertFails(
    setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), docWithInvalidMode)
  );

  // Invalid writeAuthStatus enum value must FAIL
  const docWithInvalidAuth = {
    ...docWithValidNewFields,
    writeAuthStatus: 'superuser_bypass',
  };
  await assertFails(
    setDoc(doc(aliceDb, `users/${userA}/sheets/${connId}`), docWithInvalidAuth)
  );
  await assertFails(
    setDoc(doc(aliceDb, `users/${userA}/sheet_connections/${connId}`), docWithInvalidAuth)
  );
});

