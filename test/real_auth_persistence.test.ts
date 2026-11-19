import './test_bootstrap.ts';
import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase.ts';
import app from '../api/index.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import { clientDataCache } from '../src/lib/dataCache.ts';

function createValidToken(uid: string, email = `${uid}@example.com`): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email,
      aud: 'test-rules-project',
      iss: 'https://securetoken.google.com/test-rules-project',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

describe('Real Authentication, Persistence & Account Isolation Suite', () => {
  let server: http.Server;
  let baseUrl = '';

  test('Start test HTTP server', async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  const userA = `usr_alice_real_${Date.now()}`;
  const userB = `usr_bob_real_${Date.now()}`;
  const guestUser = `gst_visitor_${Date.now().toString(36)}`;

  const tokenA = createValidToken(userA);
  const tokenB = createValidToken(userB);

  it('1. User A authenticates via real Bearer token through application server middleware', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.id, userA);
  });

  it('2. Tenant Isolation: User A token with spoofed x-user-id (User B) is rejected with HTTP 403', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-user-id': userB,
      },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Tenant isolation violation/);
  });

  it('3. Guest tokens are strictly forbidden from private Google Sheets endpoints', async () => {
    const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-session': guestUser,
      },
      body: JSON.stringify({ spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 'AUTH_REQUIRED');
  });

  it('4. User A creates private spreadsheet in application store; isolated by owner UID', async () => {
    clientDataCache.setActiveUser(userA);
    const created = await sheetHubStore.createNativeSpreadsheet(userA, {
      title: 'Alice Confidential Research 2026',
      description: 'Private research and budget notes',
      templateHint: 'table',
    });

    assert.ok(created.sheet.id.startsWith('sheet_nat_'));
    assert.equal(created.sheet.userId, userA);
    assert.equal(created.sheet.ownerUid, userA);
    assert.equal(created.sheet.isNative, true);

    // Verify User A can list and retrieve their sheet
    const aliceSheets = await sheetHubStore.listConnections(userA);
    assert.ok(aliceSheets.some((s) => s.id === created.sheet.id));

    // Verify User B cannot see User A's private sheet
    clientDataCache.setActiveUser(userB);
    const bobSheets = await sheetHubStore.listConnections(userB);
    assert.ok(!bobSheets.some((s) => s.id === created.sheet.id), "User B must not see User A's sheets");

    // Verify User B cannot read User A's spreadsheet directly
    const directRead = await sheetHubStore.getConnection(userB, created.sheet.id);
    assert.equal(directRead, null, "User B must receive null when querying User A's sheet");

    // Verify User B cannot mutate User A's tab
    await assert.rejects(async () => {
      await sheetHubStore.deleteNativeTab(userB, created.sheet.id, created.tab.id);
    }, /not found|Unauthorized/);
  });

  it('5. Account switching & cache isolation: User A cache wipe does not contaminate User B', async () => {
    // User A caches data
    clientDataCache.setActiveUser(userA);
    const connA = await sheetHubStore.getConnection(userA, 'test_conn_cached');
    assert.equal(connA, null);

    // User A signs out / switches: cache is cleared
    sheetHubStore.clearUserCache(userA);

    // User B sets active user and confirms isolated empty state
    clientDataCache.setActiveUser(userB);
    const bobConns = await sheetHubStore.listConnections(userB);
    assert.deepEqual(bobConns.filter((c) => c.userId === userA), []);
  });

  after(async () => {
    if (server) {
      server.close();
    }
    await terminate(db).catch(() => null);
  });
});
