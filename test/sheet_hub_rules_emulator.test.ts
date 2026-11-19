import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = 'test-rules-project';
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8';
const DB_PATH = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const DEFAULT_DB_PATH = `projects/${PROJECT_ID}/databases/(default)/documents`;
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

const NOW_ISO = '2026-11-18T12:00:00.000Z';

test('Sheet Hub Rules — Owner can create, read, update, and delete all 5 isolated sheet_* collections', { skip: skipReason }, async () => {
  const ownerUid = 'usr_sh_owner_1';
  const ownerJwt = makeEmulatorJwt(ownerUid);

  const connDoc = {
    id: 'conn_1',
    userId: ownerUid,
    spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    title: 'Semester 3 Tracker',
    templateHint: 'checklist',
    syncMode: 'two_way',
    pollIntervalSec: null,
    syncOnOpen: true,
    status: 'active',
    lastSyncedAt: NOW_ISO,
    lastSuccessfulPullAt: NOW_ISO,
    lastSuccessfulPushAt: null,
    lastError: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    tabOrder: ['tab_1'],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null,
  };

  const tabDoc = {
    id: 'conn_1__tab_1',
    connectionId: 'conn_1',
    userId: ownerUid,
    sheetId: 2,
    sheetTitle: 'Prob & Stats',
    role: 'data',
    headerRowIndex: 1,
    dataStartRow: 2,
    dataEndColumn: 'E',
    identityStrategy: 'composite_key',
    identityColumns: ['module_0', 'topic_1', 'subtopic_2'],
    metadataIdColumn: null,
    columns: [],
    defaultView: 'checklist',
    groupByColumnId: 'module_0',
    lastPullHash: 'abc123',
    rowCount: 127,
    chunkCount: 1,
    updatedAt: NOW_ISO,
  };

  const chunkDoc = {
    id: 'conn_1__tab_1__c0',
    connectionId: 'conn_1',
    tabId: 'conn_1__tab_1',
    userId: ownerUid,
    chunkIndex: 0,
    rowCount: 1,
    byteSize: 2048,
    rows: { row_abc: { rowUid: 'row_abc', lastKnownSheetRow: 2 } },
    updatedAt: NOW_ISO,
  };

  const queueDoc = {
    id: 'op_1',
    connectionId: 'conn_1',
    tabId: 'conn_1__tab_1',
    userId: ownerUid,
    rowUid: 'row_abc',
    colLetter: 'D',
    fieldKey: 'done_3',
    baseValue: false,
    nextValue: true,
    dedupeKey: 'conn_1__tab_1__row_abc__done_3',
    status: 'pending',
    attempts: 0,
    nextRetryAt: null,
    errorMessage: null,
    createdAt: NOW_ISO,
    lastAttemptAt: null,
  };

  const conflictDoc = {
    id: 'conf_1',
    connectionId: 'conn_1',
    tabId: 'conn_1__tab_1',
    userId: ownerUid,
    rowUid: 'row_abc',
    fieldKey: 'notes_4',
    fieldLabel: 'Notes / Practice',
    baseValue: '',
    localValue: 'Solved 5 PYQs',
    remoteValue: 'Revised notes',
    status: 'open',
    resolution: null,
    detectedAt: NOW_ISO,
    resolvedAt: null,
  };

  assert.equal(await fsWrite(`users/${ownerUid}/sheet_connections/conn_1`, connDoc, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheet_connections/conn_1`, ownerJwt), 200);

  assert.equal(await fsWrite(`users/${ownerUid}/sheet_tabs/conn_1__tab_1`, tabDoc, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheet_tabs/conn_1__tab_1`, ownerJwt), 200);

  assert.equal(await fsWrite(`users/${ownerUid}/sheet_row_chunks/conn_1__tab_1__c0`, chunkDoc, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheet_row_chunks/conn_1__tab_1__c0`, ownerJwt), 200);

  assert.equal(await fsWrite(`users/${ownerUid}/sheet_sync_queue/op_1`, queueDoc, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheet_sync_queue/op_1`, ownerJwt), 200);

  assert.equal(await fsWrite(`users/${ownerUid}/sheet_conflicts/conf_1`, conflictDoc, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheet_conflicts/conf_1`, ownerJwt), 200);

  // Valid owner update
  assert.equal(
    await fsWrite(`users/${ownerUid}/sheet_connections/conn_1`, { ...connDoc, status: 'paused' }, ownerJwt),
    200
  );

  // Clean up
  assert.equal(await fsDelete(`users/${ownerUid}/sheet_conflicts/conf_1`, ownerJwt), 200);
  assert.equal(await fsDelete(`users/${ownerUid}/sheet_sync_queue/op_1`, ownerJwt), 200);
  assert.equal(await fsDelete(`users/${ownerUid}/sheet_row_chunks/conn_1__tab_1__c0`, ownerJwt), 200);
  assert.equal(await fsDelete(`users/${ownerUid}/sheet_tabs/conn_1__tab_1`, ownerJwt), 200);
  assert.equal(await fsDelete(`users/${ownerUid}/sheet_connections/conn_1`, ownerJwt), 200);
});

test('Sheet Hub Rules — Denies cross-user reads/writes, unauthenticated access, OAuth token persistence, and invalid fields', { skip: skipReason }, async () => {
  const ownerUid = 'usr_sh_owner_2';
  const attackerUid = 'usr_sh_attacker_2';
  const ownerJwt = makeEmulatorJwt(ownerUid);
  const attackerJwt = makeEmulatorJwt(attackerUid);

  const validConn = {
    id: 'conn_priv',
    userId: ownerUid,
    spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    title: 'Private Sheet',
    templateHint: 'table',
    syncMode: 'sheet_to_app',
    pollIntervalSec: null,
    syncOnOpen: false,
    status: 'active',
    lastSyncedAt: null,
    lastSuccessfulPullAt: null,
    lastSuccessfulPushAt: null,
    lastError: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    tabOrder: [],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null,
  };

  assert.equal(await fsWrite(`users/${ownerUid}/sheet_connections/conn_priv`, validConn, ownerJwt), 200);

  // ----------------------------------------------------
  // COLLECTION 1: sheet_connections
  // ----------------------------------------------------
  // Cross-user read/write/delete DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_connections/conn_priv`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_connections/conn_priv`, { ...validConn, title: 'Hacked' }, attackerJwt), 403);
  assert.equal(await fsDelete(`users/${ownerUid}/sheet_connections/conn_priv`, attackerJwt), 403);

  // Unauthenticated read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_connections/conn_priv`), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_connections/conn_unauth`, validConn), 403);

  // Storing OAuth accessToken or unknown field in Firestore MUST BE DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_connections/conn_with_token`,
      { ...validConn, id: 'conn_with_token', accessToken: 'ya29.secret_token' },
      ownerJwt
    ),
    403
  );
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_connections/conn_with_refresh`,
      { ...validConn, id: 'conn_with_refresh', refreshToken: '1//refresh_secret' },
      ownerJwt
    ),
    403
  );
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_connections/conn_extra_field`,
      { ...validConn, id: 'conn_extra_field', unexpectedField: 'injected' },
      ownerJwt
    ),
    403
  );

  // Invalid syncMode MUST BE DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_connections/conn_bad_mode`,
      { ...validConn, id: 'conn_bad_mode', syncMode: 'arbitrary_mode' },
      ownerJwt
    ),
    403
  );

  // ----------------------------------------------------
  // COLLECTION 2: sheet_tabs
  // ----------------------------------------------------
  const validTab = {
    id: 'conn_priv__tab_1',
    connectionId: 'conn_priv',
    userId: ownerUid,
    sheetId: 10,
    sheetTitle: 'Tab One',
    role: 'data',
    headerRowIndex: 1,
    dataStartRow: 2,
    dataEndColumn: 'D',
    identityStrategy: 'composite_key',
    identityColumns: ['col_0', 'col_1'],
    metadataIdColumn: null,
    columns: [],
    defaultView: 'table',
    groupByColumnId: null,
    lastPullHash: 'hash123',
    rowCount: 50,
    chunkCount: 1,
    updatedAt: NOW_ISO,
  };
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_tabs/conn_priv__tab_1`, validTab, ownerJwt), 200);

  // Cross-user read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_tabs/conn_priv__tab_1`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_tabs/conn_priv__tab_1`, { ...validTab, sheetTitle: 'Hacked' }, attackerJwt), 403);

  // Unauthenticated read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_tabs/conn_priv__tab_1`), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_tabs/conn_priv__tab_unauth`, validTab), 403);

  // Unexpected field rejected (hasOnly constraint)
  assert.equal(
    await fsWrite(`users/${ownerUid}/sheet_tabs/conn_priv__tab_bad`, { ...validTab, id: 'conn_priv__tab_bad', secretInjected: 'bad' }, ownerJwt),
    403
  );

  // Malformed tab: invalid role rejected
  assert.equal(
    await fsWrite(`users/${ownerUid}/sheet_tabs/conn_priv__tab_bad_role`, { ...validTab, id: 'conn_priv__tab_bad_role', role: 'invalid_role' }, ownerJwt),
    403
  );

  // ----------------------------------------------------
  // COLLECTION 3: sheet_row_chunks
  // ----------------------------------------------------
  const validChunk = {
    id: 'conn_priv__tab_1__c0',
    connectionId: 'conn_priv',
    tabId: 'conn_priv__tab_1',
    userId: ownerUid,
    chunkIndex: 0,
    rowCount: 1,
    byteSize: 1024,
    rows: { row_1: { rowUid: 'row_1', lastKnownSheetRow: 2 } },
    updatedAt: NOW_ISO,
  };
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_row_chunks/conn_priv__tab_1__c0`, validChunk, ownerJwt), 200);

  // Cross-user read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_row_chunks/conn_priv__tab_1__c0`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_row_chunks/conn_priv__tab_1__c0`, { ...validChunk, rowCount: 99 }, attackerJwt), 403);

  // Unauthenticated read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_row_chunks/conn_priv__tab_1__c0`), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_row_chunks/conn_priv__tab_1__c_unauth`, validChunk), 403);

  // Oversized chunk byteSize > 850000 MUST BE DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_row_chunks/chunk_too_big`,
      { ...validChunk, id: 'chunk_too_big', byteSize: 999999 },
      ownerJwt
    ),
    403
  );

  // Unexpected field rejected
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_row_chunks/chunk_bad_field`,
      { ...validChunk, id: 'chunk_bad_field', token: 'bad_token' },
      ownerJwt
    ),
    403
  );

  // ----------------------------------------------------
  // COLLECTION 4: sheet_sync_queue
  // ----------------------------------------------------
  const validQueueOp = {
    id: 'op_queue_1',
    connectionId: 'conn_priv',
    tabId: 'conn_priv__tab_1',
    userId: ownerUid,
    rowUid: 'row_1',
    colLetter: 'C',
    fieldKey: 'done_2',
    baseValue: false,
    nextValue: true,
    dedupeKey: 'conn_priv__tab_1__row_1__done_2',
    status: 'pending',
    attempts: 0,
    nextRetryAt: null,
    errorMessage: null,
    createdAt: NOW_ISO,
    lastAttemptAt: null,
  };
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_sync_queue/op_queue_1`, validQueueOp, ownerJwt), 200);

  // Cross-user read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_sync_queue/op_queue_1`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_sync_queue/op_queue_1`, { ...validQueueOp, status: 'completed' }, attackerJwt), 403);

  // Unauthenticated read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_sync_queue/op_queue_1`), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_sync_queue/op_queue_unauth`, validQueueOp), 403);

  // Invalid status rejected
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_sync_queue/op_queue_bad_status`,
      { ...validQueueOp, id: 'op_queue_bad_status', status: 'illegal_status' },
      ownerJwt
    ),
    403
  );

  // Unexpected field rejected
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_sync_queue/op_queue_extra`,
      { ...validQueueOp, id: 'op_queue_extra', unauthorizedKey: 123 },
      ownerJwt
    ),
    403
  );

  // ----------------------------------------------------
  // COLLECTION 5: sheet_conflicts
  // ----------------------------------------------------
  const validConflict = {
    id: 'conf_1',
    connectionId: 'conn_priv',
    tabId: 'conn_priv__tab_1',
    userId: ownerUid,
    rowUid: 'row_1',
    fieldKey: 'notes_3',
    fieldLabel: 'Notes',
    baseValue: 'Initial notes',
    localValue: 'Local update',
    remoteValue: 'Remote sheet update',
    status: 'open',
    resolution: null,
    detectedAt: NOW_ISO,
    resolvedAt: null,
  };
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_conflicts/conf_1`, validConflict, ownerJwt), 200);

  // Cross-user read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_conflicts/conf_1`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_conflicts/conf_1`, { ...validConflict, status: 'resolved' }, attackerJwt), 403);

  // Unauthenticated read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheet_conflicts/conf_1`), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheet_conflicts/conf_unauth`, validConflict), 403);

  // Invalid resolution rejected
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_conflicts/conf_bad_res`,
      { ...validConflict, id: 'conf_bad_res', resolution: 'bad_resolution_val' },
      ownerJwt
    ),
    403
  );

  // Unexpected field rejected
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheet_conflicts/conf_extra`,
      { ...validConflict, id: 'conf_extra', injectedPayload: true },
      ownerJwt
    ),
    403
  );

  // ----------------------------------------------------
  // CANONICAL PRIVATE SHEET HIERARCHY:
  // match /users/{userId}/sheets/{sheetId}
  //   -> tabs/{tabId}
  //   -> rows/{rowId}
  //   -> row_chunks/{chunkId}
  // ----------------------------------------------------
  const validSheet = {
    id: 'sheet_priv_1',
    userId: ownerUid,
    title: 'Multi-User Private Academic Tracker',
    spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    description: 'Private student academic workbook',
    templateHint: 'tracker',
    syncMode: 'two_way',
    status: 'active',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    deletedAt: null,
  };

  // 1. Owner can create canonical sheet
  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1`, validSheet, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1`, ownerJwt), 200);

  // Cross-user read/write/delete DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1`, { ...validSheet, title: 'Hacked Title' }, attackerJwt), 403);
  assert.equal(await fsDelete(`users/${ownerUid}/sheets/sheet_priv_1`, attackerJwt), 403);

  // Unauthenticated read/write DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1`), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_unauth`, validSheet), 403);

  // UID mismatch on create DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_bad_uid`,
      { ...validSheet, id: 'sheet_bad_uid', userId: attackerUid },
      ownerJwt
    ),
    403
  );

  // ID mismatch on create DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_mismatch_id`,
      { ...validSheet, id: 'different_id' },
      ownerJwt
    ),
    403
  );

  // UID reassignment on update DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_priv_1`,
      { ...validSheet, userId: attackerUid },
      ownerJwt
    ),
    403
  );

  // ID reassignment on update DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_priv_1`,
      { ...validSheet, id: 'sheet_hacked_id' },
      ownerJwt
    ),
    403
  );

  // OAuth token persistence (accessToken or refreshToken) MUST BE DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_token_leak`,
      { ...validSheet, id: 'sheet_token_leak', accessToken: 'ya29.evil_token' },
      ownerJwt
    ),
    403
  );
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_refresh_leak`,
      { ...validSheet, id: 'sheet_refresh_leak', refreshToken: '1//refresh_token' },
      ownerJwt
    ),
    403
  );

  // Arbitrary extra field (schema pollution) MUST BE DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_extra_field`,
      { ...validSheet, id: 'sheet_extra_field', injectedProp: 'malicious' },
      ownerJwt
    ),
    403
  );

  // 2. Nested tab: /users/{userId}/sheets/{sheetId}/tabs/{tabId}
  const validNestedTab = {
    id: 'tab_math',
    sheetDocId: 'sheet_priv_1',
    userId: ownerUid,
    title: 'Math Syllabus',
    sheetTitle: 'Math Syllabus',
    role: 'data',
    headerRowIndex: 1,
    dataStartRow: 2,
    defaultView: 'checklist',
    rowCount: 25,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };

  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math`, validNestedTab, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math`, ownerJwt), 200);

  // Attacker cross-user access to nested tab DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math`, { ...validNestedTab, title: 'Hacked' }, attackerJwt), 403);
  assert.equal(await fsDelete(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math`, attackerJwt), 403);

  // Unauthenticated access to nested tab DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math`), 403);

  // Nested tab UID mismatch DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_bad_uid`,
      { ...validNestedTab, id: 'tab_bad_uid', userId: attackerUid },
      ownerJwt
    ),
    403
  );

  // 3. Nested rows: /users/{userId}/sheets/{sheetId}/tabs/{tabId}/rows/{rowId}
  const validRow = {
    id: 'row_101',
    sheetDocId: 'sheet_priv_1',
    tabId: 'tab_math',
    userId: ownerUid,
    rowUid: 'row_101',
    values: { topic: 'Differential Equations', status: 'done' },
    status: 'synced',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };

  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math/rows/row_101`, validRow, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math/rows/row_101`, ownerJwt), 200);

  // Attacker access to nested row DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math/rows/row_101`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math/rows/row_101`, { ...validRow, values: { status: 'hacked' } }, attackerJwt), 403);

  // Row UID mismatch DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_priv_1/tabs/tab_math/rows/row_bad_uid`,
      { ...validRow, id: 'row_bad_uid', userId: attackerUid },
      ownerJwt
    ),
    403
  );

  // 4. Nested row chunk: /users/{userId}/sheets/{sheetId}/row_chunks/{chunkId}
  const validNestedChunk = {
    id: 'chunk_0',
    sheetDocId: 'sheet_priv_1',
    tabId: 'tab_math',
    userId: ownerUid,
    chunkIndex: 0,
    rowCount: 1,
    byteSize: 512,
    rows: { row_101: { rowUid: 'row_101', lastKnownSheetRow: 2 } },
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };

  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1/row_chunks/chunk_0`, validNestedChunk, ownerJwt), 200);
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1/row_chunks/chunk_0`, ownerJwt), 200);

  // Attacker access to nested chunk DENIED
  assert.equal(await fsRead(`users/${ownerUid}/sheets/sheet_priv_1/row_chunks/chunk_0`, attackerJwt), 403);
  assert.equal(await fsWrite(`users/${ownerUid}/sheets/sheet_priv_1/row_chunks/chunk_0`, { ...validNestedChunk, rowCount: 99 }, attackerJwt), 403);

  // Chunk UID mismatch DENIED
  assert.equal(
    await fsWrite(
      `users/${ownerUid}/sheets/sheet_priv_1/row_chunks/chunk_bad_uid`,
      { ...validNestedChunk, id: 'chunk_bad_uid', userId: attackerUid },
      ownerJwt
    ),
    403
  );
});

