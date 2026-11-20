import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = 'test-rules-project';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8';
const DB_PATH = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const BASE_URL = `http://${HOST}/v1/${DB_PATH}`;

const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const skipReason = !isEmulatorRunning
  ? 'Live Firestore emulator host not detected (run via firebase emulators:exec --only firestore)'
  : false;

function makeEmulatorJwt(uid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: uid,
    user_id: uid,
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    email: `${uid}@example.com`,
    email_verified: true,
  };
  return `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
}

function toFsVal(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFsVal) } };
  }
  if (typeof v === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) fields[k] = toFsVal(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFsDoc(obj: Record<string, unknown>): { fields: Record<string, unknown> } {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFsVal(v);
  }
  return { fields };
}

async function fsWrite(docPath: string, data: Record<string, unknown>, jwt?: string): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${BASE_URL}/${docPath}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(toFsDoc(data)),
  });
  return res.status;
}

async function fsRead(docPath: string, jwt?: string): Promise<number> {
  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${BASE_URL}/${docPath}`, { method: 'GET', headers });
  return res.status;
}

async function fsDelete(docPath: string, jwt?: string): Promise<number> {
  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${BASE_URL}/${docPath}`, { method: 'DELETE', headers });
  return res.status;
}

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
  const ownerJwt = makeEmulatorJwt(userA);
  const connId = 'conn_1BxiMVs0XRA5nFMdKvBdBZjgm_m01abc123';
  const docData = makeStep7ConnectionDoc(userA, connId, 'sheet_to_app');

  // Write 1: Canonical path users/{userId}/sheets/{connId}
  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, docData, ownerJwt),
    200
  );

  // Read 1: Canonical path
  assert.equal(
    await fsRead(`users/${userA}/sheets/${connId}`, ownerJwt),
    200
  );

  // Write 2: Index path users/{userId}/sheet_connections/{connId}
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, docData, ownerJwt),
    200
  );

  // Read 2: Index path
  assert.equal(
    await fsRead(`users/${userA}/sheet_connections/${connId}`, ownerJwt),
    200
  );
});

test('2. Two-way sync mode connection creates and updates successfully for owner', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const ownerJwt = makeEmulatorJwt(userA);
  const connId = 'conn_two_way_456';
  const docData = makeStep7ConnectionDoc(userA, connId, 'two_way');

  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, docData, ownerJwt),
    200
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, docData, ownerJwt),
    200
  );

  // Update status to paused
  const updatedData = {
    ...docData,
    status: 'paused',
    updatedAt: new Date().toISOString(),
  };

  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, updatedData, ownerJwt),
    200
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, updatedData, ownerJwt),
    200
  );
});

test('3. Cross-User Isolation — User B CANNOT read, create, update, or delete User A connections', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const userB = 'user_bob_456';
  const ownerJwt = makeEmulatorJwt(userA);
  const attackerJwt = makeEmulatorJwt(userB);
  const connId = 'conn_alice_secret';
  const docData = makeStep7ConnectionDoc(userA, connId, 'sheet_to_app');

  // Alice creates her connection
  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, docData, ownerJwt),
    200
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, docData, ownerJwt),
    200
  );

  // Bob CANNOT read Alice's sheets or sheet_connections
  assert.equal(await fsRead(`users/${userA}/sheets/${connId}`, attackerJwt), 403);
  assert.equal(await fsRead(`users/${userA}/sheet_connections/${connId}`, attackerJwt), 403);

  // Bob CANNOT update Alice's sheets or sheet_connections
  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, { ...docData, title: 'Hacked by Bob' }, attackerJwt),
    403
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, { ...docData, title: 'Hacked by Bob' }, attackerJwt),
    403
  );

  // Bob CANNOT delete Alice's sheets or sheet_connections
  assert.equal(await fsDelete(`users/${userA}/sheets/${connId}`, attackerJwt), 403);
  assert.equal(await fsDelete(`users/${userA}/sheet_connections/${connId}`, attackerJwt), 403);

  // Bob CANNOT create documents in Alice's namespace
  assert.equal(
    await fsWrite(`users/${userA}/sheets/conn_bob_intruder`, makeStep7ConnectionDoc(userA, 'conn_bob_intruder'), attackerJwt),
    403
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/conn_bob_intruder`, makeStep7ConnectionDoc(userA, 'conn_bob_intruder'), attackerJwt),
    403
  );
});

test('4. Unauthenticated Access — Rejected for all reads, creates, updates, and deletes', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const connId = 'conn_unauth_test';
  const docData = makeStep7ConnectionDoc(userA, connId, 'sheet_to_app');

  assert.equal(await fsRead(`users/${userA}/sheets/${connId}`), 403);
  assert.equal(await fsRead(`users/${userA}/sheet_connections/${connId}`), 403);

  assert.equal(await fsWrite(`users/${userA}/sheets/${connId}`, docData), 403);
  assert.equal(await fsWrite(`users/${userA}/sheet_connections/${connId}`, docData), 403);

  assert.equal(await fsDelete(`users/${userA}/sheets/${connId}`), 403);
  assert.equal(await fsDelete(`users/${userA}/sheet_connections/${connId}`), 403);
});

test('5. Anti-Spoofing — User A cannot create a document with mismatched userId or ownerUid', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const userB = 'user_bob_456';
  const ownerJwt = makeEmulatorJwt(userA);
  const connId = 'conn_spoof_attempt';

  // Mismatched userId in payload
  const spoofedUserId = {
    ...makeStep7ConnectionDoc(userA, connId),
    userId: userB,
  };
  assert.equal(await fsWrite(`users/${userA}/sheets/${connId}`, spoofedUserId, ownerJwt), 403);
  assert.equal(await fsWrite(`users/${userA}/sheet_connections/${connId}`, spoofedUserId, ownerJwt), 403);

  // Mismatched ownerUid in payload
  const spoofedOwnerUid = {
    ...makeStep7ConnectionDoc(userA, connId),
    ownerUid: userB,
  };
  assert.equal(await fsWrite(`users/${userA}/sheets/${connId}`, spoofedOwnerUid, ownerJwt), 403);
  assert.equal(await fsWrite(`users/${userA}/sheet_connections/${connId}`, spoofedOwnerUid, ownerJwt), 403);
});

test('6. OAuth token fields — Rejected if accessToken or refreshToken are present', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const ownerJwt = makeEmulatorJwt(userA);
  const connId = 'conn_token_leak';

  const withAccessToken = {
    ...makeStep7ConnectionDoc(userA, connId),
    accessToken: 'ya29.secret_token',
  };
  assert.equal(await fsWrite(`users/${userA}/sheets/${connId}`, withAccessToken, ownerJwt), 403);
  assert.equal(await fsWrite(`users/${userA}/sheet_connections/${connId}`, withAccessToken, ownerJwt), 403);

  const withRefreshToken = {
    ...makeStep7ConnectionDoc(userA, connId),
    refreshToken: '1//refresh_token',
  };
  assert.equal(await fsWrite(`users/${userA}/sheets/${connId}`, withRefreshToken, ownerJwt), 403);
  assert.equal(await fsWrite(`users/${userA}/sheet_connections/${connId}`, withRefreshToken, ownerJwt), 403);
});

test('7. New fields — writeMode, writeAuthStatus, writeAuthorizedAt validation', { skip: skipReason }, async () => {
  const userA = 'user_alice_123';
  const ownerJwt = makeEmulatorJwt(userA);
  const connId = 'conn_write_status_test';

  const docWithValidNewFields = {
    ...makeStep7ConnectionDoc(userA, connId, 'two_way'),
    writeMode: 'native_oauth',
    writeAuthStatus: 'authorized',
    writeAuthorizedAt: new Date().toISOString(),
  };

  // Valid Native OAuth tracking fields must SUCCEED for owner
  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, docWithValidNewFields, ownerJwt),
    200
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, docWithValidNewFields, ownerJwt),
    200
  );

  // Invalid writeMode enum value must FAIL (403)
  const docWithInvalidMode = {
    ...docWithValidNewFields,
    writeMode: 'unauthorized_hack_mode',
  };
  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, docWithInvalidMode, ownerJwt),
    403
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, docWithInvalidMode, ownerJwt),
    403
  );

  // Invalid writeAuthStatus enum value must FAIL (403)
  const docWithInvalidAuth = {
    ...docWithValidNewFields,
    writeAuthStatus: 'superuser_bypass',
  };
  assert.equal(
    await fsWrite(`users/${userA}/sheets/${connId}`, docWithInvalidAuth, ownerJwt),
    403
  );
  assert.equal(
    await fsWrite(`users/${userA}/sheet_connections/${connId}`, docWithInvalidAuth, ownerJwt),
    403
  );
});
