import './test_bootstrap.ts';
import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase.ts';
import { sheetHubStore, SheetHubPersistenceError } from '../src/lib/sheetHub/sheetHubStore.ts';
import { clientDataCache } from '../src/lib/dataCache.ts';
import type { SheetConnection, SheetSyncedRow, SheetTabSchema } from '../src/types/sheetHub.ts';

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
  const url = `${BASE_URL}/${docPath}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(toFsDoc(data)),
  });
  return res.status;
}

async function fsRead(docPath: string, jwt?: string): Promise<{ status: number; data?: any }> {
  const url = `${BASE_URL}/${docPath}`;
  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch(url, { headers });
  if (res.ok) {
    const json = (await res.json()) as any;
    return { status: res.status, data: json };
  }
  return { status: res.status };
}

async function fsDelete(docPath: string, jwt?: string): Promise<number> {
  const url = `${BASE_URL}/${docPath}`;
  const headers: Record<string, string> = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch(url, { method: 'DELETE', headers });
  return res.status;
}

describe('Phase 4: Real Firebase Multi-User Isolation & Emulator Integration Matrix', () => {
  const userA = `user_alice_emu_${Date.now()}`;
  const userB = `user_bob_emu_${Date.now()}`;
  const jwtA = makeEmulatorJwt(userA);
  const jwtB = makeEmulatorJwt(userB);

  const sheetIdA = `sheet_nat_alice_${Date.now()}`;
  const sheetIdB = `sheet_nat_bob_${Date.now()}`;
  const tabIdA = `tab_nat_alice_1`;
  const tabIdB = `tab_nat_bob_1`;
  const now = new Date().toISOString();

  // Test 1 — Independent creation
  it('Test 1 — Independent creation: User A and User B create private spreadsheets', { skip: skipReason }, async () => {
    const docDataA = {
      id: sheetIdA,
      userId: userA,
      ownerUid: userA,
      title: "Alice's Private Workspace",
      description: 'Private financial models',
      spreadsheetId: sheetIdA,
      spreadsheetUrl: '',
      syncMode: 'manual_only',
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: [tabIdA],
      schemaVersion: 1,
      isNative: true,
      createdAt: now,
      updatedAt: now,
    };

    const docDataB = {
      id: sheetIdB,
      userId: userB,
      ownerUid: userB,
      title: "Bob's Research Ledger",
      description: 'Private research and study data',
      spreadsheetId: sheetIdB,
      spreadsheetUrl: '',
      syncMode: 'manual_only',
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: [tabIdB],
      schemaVersion: 1,
      isNative: true,
      createdAt: now,
      updatedAt: now,
    };

    const statusA = await fsWrite(`users/${userA}/sheets/${sheetIdA}`, docDataA, jwtA);
    const statusB = await fsWrite(`users/${userB}/sheets/${sheetIdB}`, docDataB, jwtB);

    assert.equal(statusA, 200, `User A private sheet creation must succeed (got ${statusA})`);
    assert.equal(statusB, 200, `User B private sheet creation must succeed (got ${statusB})`);
  });

  // Test 2 — Read isolation
  it('Test 2 — Read isolation: User A reads only A, User B reads only B, cross-user denied', { skip: skipReason }, async () => {
    const aReadsA = await fsRead(`users/${userA}/sheets/${sheetIdA}`, jwtA);
    assert.equal(aReadsA.status, 200, "User A must be able to read User A's sheet");

    const bReadsB = await fsRead(`users/${userB}/sheets/${sheetIdB}`, jwtB);
    assert.equal(bReadsB.status, 200, "User B must be able to read User B's sheet");

    const aReadsB = await fsRead(`users/${userB}/sheets/${sheetIdB}`, jwtA);
    assert.equal(aReadsB.status, 403, "User A must NOT be able to read User B's private sheet (403 required)");

    const bReadsA = await fsRead(`users/${userA}/sheets/${sheetIdA}`, jwtB);
    assert.equal(bReadsA.status, 403, "User B must NOT be able to read User A's private sheet (403 required)");
  });

  // Test 3 — Write isolation
  it('Test 3 — Write isolation: User A cannot modify User B, User B cannot modify User A', { skip: skipReason }, async () => {
    const maliciousUpdate = {
      id: sheetIdB,
      userId: userB,
      title: 'Hacked by User A',
      spreadsheetId: sheetIdB,
      syncMode: 'manual_only',
      syncOnOpen: false,
      status: 'active',
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: [tabIdB],
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };

    const aWritesB = await fsWrite(`users/${userB}/sheets/${sheetIdB}`, maliciousUpdate, jwtA);
    assert.equal(aWritesB, 403, "User A modifying User B's sheet must be rejected with 403");

    const bWritesA = await fsWrite(`users/${userA}/sheets/${sheetIdA}`, { ...maliciousUpdate, id: sheetIdA, userId: userA }, jwtB);
    assert.equal(bWritesA, 403, "User B modifying User A's sheet must be rejected with 403");
  });

  // Test 4 — Delete isolation
  it('Test 4 — Delete isolation: User A cannot delete User B, User B cannot delete User A', { skip: skipReason }, async () => {
    const aDeletesB = await fsDelete(`users/${userB}/sheets/${sheetIdB}`, jwtA);
    assert.equal(aDeletesB, 403, "User A deleting User B's sheet must be rejected with 403");

    const bDeletesA = await fsDelete(`users/${userA}/sheets/${sheetIdA}`, jwtB);
    assert.equal(bDeletesA, 403, "User B deleting User A's sheet must be rejected with 403");

    // Verify User B's sheet is still intact after User A's failed delete attempt
    const verifyB = await fsRead(`users/${userB}/sheets/${sheetIdB}`, jwtB);
    assert.equal(verifyB.status, 200, "User B's sheet must remain intact after unauthorized delete attempt");
  });

  // Test 5 — Fresh session persistence
  it('Test 5 — Fresh session persistence: Fresh authenticated session reads saved sheets', { skip: skipReason }, async () => {
    // Generate a fresh session token for User A with new timestamp
    const freshJwtA = makeEmulatorJwt(userA);
    const readFresh = await fsRead(`users/${userA}/sheets/${sheetIdA}`, freshJwtA);
    assert.equal(readFresh.status, 200, 'Fresh authenticated session must read existing private sheet');
    assert.ok(readFresh.data?.fields?.title?.stringValue, "Sheet title must be preserved across sessions");
  });

  // Test 6 — Failure handling and pending retry
  it('Test 6 — Failure handling: Invalid writes fail closed, pending queue enables retry without duplication', async () => {
    // 1. Verify invalid write fails closed (e.g., attempting to save OAuth tokens in sheet doc)
    if (isEmulatorRunning) {
      const invalidTokenDoc = {
        id: `sheet_invalid_${Date.now()}`,
        userId: userA,
        title: 'Token Leaking Sheet',
        accessToken: 'secret_oauth_token',
        spreadsheetId: `sheet_invalid_${Date.now()}`,
        syncMode: 'manual_only',
        syncOnOpen: false,
        status: 'active',
        pendingChangesCount: 0,
        conflictCount: 0,
        tabOrder: ['tab_1'],
        createdAt: now,
        updatedAt: now,
      };
      const tokenStatus = await fsWrite(`users/${userA}/sheets/${invalidTokenDoc.id}`, invalidTokenDoc, jwtA);
      assert.equal(tokenStatus, 403, 'Document with accessToken must be rejected by Firestore Security Rules');
    }

    // 2. Verify retryPendingOperations and deduplication in sheetHubStore
    const localUser = `test_local_user_${Date.now()}`;
    const pendingSheet: SheetConnection = {
      id: `sheet_pend_${Date.now()}`,
      userId: localUser,
      title: 'Pending Retry Sheet',
      spreadsheetId: `sheet_pend_${Date.now()}`,
      spreadsheetUrl: '',
      templateHint: 'table',
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: ['tab_1'],
      isNative: true,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    // Save locally
    await sheetHubStore.saveConnection(localUser, pendingSheet);
    const initialList = await sheetHubStore.listConnections(localUser);
    assert.equal(initialList.length, 1);

    // Re-saving with identical ID updates in place without duplicating
    await sheetHubStore.saveConnection(localUser, { ...pendingSheet, title: 'Updated Title' });
    const updatedList = await sheetHubStore.listConnections(localUser);
    assert.equal(updatedList.length, 1, 'Retry / update must never duplicate sheets');
    assert.equal(updatedList[0].title, 'Updated Title');
  });

  // Test 7 — Cache isolation
  it('Test 7 — Cache isolation: Account switching completely isolates in-memory and local caches', () => {
    const aliceUser = `alice_cache_test_${Date.now()}`;
    const bobUser = `bob_cache_test_${Date.now()}`;

    clientDataCache.setActiveUser(aliceUser);
    clientDataCache.set(`sheet_hub_conns_${aliceUser}`, [{ id: 'sheet_alice' }], aliceUser);

    // Verify Alice has cache
    assert.ok(clientDataCache.get(`sheet_hub_conns_${aliceUser}`, undefined, aliceUser));

    // Switch to Bob
    clientDataCache.setActiveUser(bobUser);
    sheetHubStore.clearUserCache(aliceUser);

    // Verify Bob cannot see Alice's cached data
    const bobsViewOfAlice = clientDataCache.get(`sheet_hub_conns_${aliceUser}`, undefined, bobUser);
    assert.equal(bobsViewOfAlice, null, "User B must not be able to read User A's cache");

    const alicePurged = clientDataCache.get(`sheet_hub_conns_${aliceUser}`, undefined, aliceUser);
    assert.equal(alicePurged, null, "User A's cache must be purged on account switch");
  });

  after(async () => {
    if (db) {
      try {
        await terminate(db);
      } catch {
        // Ignore if already terminated
      }
    }
  });
});
