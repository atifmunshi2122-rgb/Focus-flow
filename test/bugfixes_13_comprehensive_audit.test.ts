import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import http from 'node:http';

import { flushQueueOperations } from '../server/sheetsWorker.ts';
import { pushSheetHubCellUpdates } from '../server/sheetHubWriteWorker.ts';
import { inspectPublicSpreadsheet, SheetHubWorkerError } from '../server/universalSheetsWorker.ts';
import {
  vaultBackendService,
  VaultServiceError,
  __setServiceAccountForTesting,
} from '../server/vaultBackendService.ts';
import { V18StorageService } from '../server/v18StorageService.ts';
import { apiRouter } from '../server/routes.ts';
import { dbService } from '../server/db.ts';
import { formatPaiseForInput, toPaise } from '../src/lib/currency.ts';
import { formatDateInTimezone, getStartOfWeek } from '../src/lib/dateTime.ts';
import * as socialService from '../server/socialService.ts';

function makeAuthToken(userId: string, email = `${userId}@example.com`, name = 'Test User'): string {
  const payload = {
    user_id: userId,
    sub: userId,
    email,
    name,
    iss: 'https://securetoken.google.com/test-rules-project',
    aud: 'test-rules-project',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 10,
  };
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const bodyB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${headerB64}.${bodyB64}.`;
}

describe('Comprehensive Audit — All 13 Bugfixes Regression Suite', () => {
  const originalFetch = globalThis.fetch;
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    __setServiceAccountForTesting(undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __setServiceAccountForTesting(undefined);
  });

  it('1. sheetsWorker flushQueueOperations keeps :append outside encodeURIComponent and escapes formula payloads', async () => {
    const requestedUrls: string[] = [];
    const appendBodies: unknown[] = [];

    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes('values:batchGet')) {
        return new Response(JSON.stringify({ valueRanges: [{ values: [] }] }), { status: 200 });
      }
      if (url.includes(':append')) {
        appendBodies.push(JSON.parse(String(init?.body || '{}')));
        return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          sheets: [{ properties: { title: 'Variable Expenses', sheetId: 0 } }],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const summary = await flushQueueOperations(
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      'ya29.test_token',
      [
        {
          id: 'op_create_formula',
          userId: 'u1',
          entityType: 'expense',
          action: 'append',
          sheetName: 'Variable Expenses',
          payload: ['exp_1', '=HYPERLINK("http://evil")', -50, '+cmd'],
          dedupeKey: 'exp_1',
          attempts: 0,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'op_upsert_missing',
          userId: 'u1',
          entityType: 'expense',
          action: 'update',
          sheetName: 'Variable Expenses',
          payload: ['exp_2', '@SUM(A1:A2)', 120],
          dedupeKey: 'exp_2',
          attempts: 0,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ],
      mockFetch
    );

    assert.equal(summary.processed, 2);
    const appendUrls = requestedUrls.filter((u) => u.includes('/values/'));
    assert.equal(appendUrls.length, 2);
    for (const u of appendUrls) {
      assert.ok(u.includes(':append?valueInputOption=USER_ENTERED'), `Expected literal :append in ${u}`);
      assert.ok(!u.includes('%3Aappend'), `Must NOT percent-encode :append in ${u}`);
    }
    assert.deepEqual((appendBodies[0] as any).values[0], ['exp_1', "'=HYPERLINK(\"http://evil\")", -50, "'+cmd"]);
    assert.deepEqual((appendBodies[1] as any).values[0], ['exp_2', "'@SUM(A1:A2)", 120]);
  });

  it('2. Time Capsule enforces parseIsoDate, ignores client tz headers, and blocks PUT unlockDate bypass on sealed capsules', async () => {
    const token = makeAuthToken(`usr_cap_sec_${Date.now()}`);

    // Malformed unlockDate rejected with 400
    const badPost = await fetch(`${baseUrl}/api/time-capsules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Bad', content: 'Secret', unlockDate: '2026-02-31' }),
    });
    assert.equal(badPost.status, 400);

    // Create sealed future capsule
    const secretContent = 'Top secret future reflection';
    const postRes = await fetch(`${baseUrl}/api/time-capsules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Locked 2099', content: secretContent, unlockDate: '2099-12-31' }),
    });
    assert.equal(postRes.status, 201);
    const created = (await postRes.json()) as any;
    assert.equal(created.isUnlocked, false);
    assert.equal(created.content, '');

    // Malicious PUT changing unlockDate to a past date must return 403 CAPSULE_SEALED
    const bypassPut = await fetch(`${baseUrl}/api/time-capsules/${created.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-timezone': 'Pacific/Kiritimati',
      },
      body: JSON.stringify({ unlockDate: '2020-01-01' }),
    });
    assert.equal(bypassPut.status, 403);
    const bypassJson = (await bypassPut.json()) as any;
    assert.equal(bypassJson.code, 'CAPSULE_SEALED');

    // Confirm content stays redacted even when sending spoofed ?tz=
    const getRes = await fetch(`${baseUrl}/api/time-capsules/${created.id}?tz=Pacific/Kiritimati`, {
      headers: { Authorization: `Bearer ${token}`, 'x-timezone': 'Pacific/Kiritimati' },
    });
    assert.equal(getRes.status, 200);
    const fetched = (await getRes.json()) as any;
    assert.equal(fetched.isUnlocked, false);
    assert.equal(fetched.content, '');
  });

  it('3. GET /api/social/overview filters out strangers, blocked users, and non-member private squad sessions', async () => {
    const suffix = Date.now().toString(36);
    const userA = `usr_soc_a_${suffix}`;
    const userFriend = `usr_soc_f_${suffix}`;
    const userStranger = `usr_soc_s_${suffix}`;
    const userBlocked = `usr_soc_b_${suffix}`;
    const db = dbService.getRawDatabase();
    db.users.push(
      { id: userA, name: 'Alice', email: `${userA}@x.com` } as any,
      { id: userFriend, name: 'Friend', email: `${userFriend}@x.com` } as any,
      { id: userStranger, name: 'Stranger', email: `${userStranger}@x.com` } as any,
      { id: userBlocked, name: 'Blocked', email: `${userBlocked}@x.com` } as any
    );

    db.friendships = db.friendships || [];
    db.friendships.push(
      { id: `fr_${suffix}_1`, requesterId: userA, recipientId: userFriend, status: 'accepted', createdAt: Date.now() } as any,
      { id: `fr_${suffix}_2`, requesterId: userA, recipientId: userBlocked, status: 'blocked', createdAt: Date.now() } as any
    );

    const mySquad = socialService.createSocialSquad(db, userA, { name: `SquadA_${suffix}`, privacy: 'private' });
    const otherSquad = socialService.createSocialSquad(db, userStranger, { name: `SquadB_${suffix}`, privacy: 'private' });
    socialService.createGroupStudySession(db, userA, { squadId: mySquad.id, roomId: 'r1', durationSeconds: 1500 });
    const privateOtherSess = socialService.createGroupStudySession(db, userStranger, {
      squadId: otherSquad.id,
      roomId: 'r2',
      durationSeconds: 1500,
    });

    db.socialActivities = db.socialActivities || [];
    db.socialActivities.unshift(
      { id: `act_friend_${suffix}`, actorId: userFriend, actorName: 'Friend', type: 'session_completed', visibility: 'friends', createdAt: Date.now(), metadata: {} } as any,
      { id: `act_stranger_${suffix}`, actorId: userStranger, actorName: 'Stranger', type: 'session_completed', visibility: 'public', createdAt: Date.now(), metadata: {} } as any,
      { id: `act_blocked_${suffix}`, actorId: userBlocked, actorName: 'Blocked', type: 'session_completed', visibility: 'friends', createdAt: Date.now(), metadata: {} } as any
    );

    const res = await fetch(`${baseUrl}/api/social/overview`, {
      headers: { Authorization: `Bearer ${makeAuthToken(userA)}` },
    });
    assert.equal(res.status, 200);
    const overview = (await res.json()) as any;
    const actIds = new Set((overview.activities || []).map((a: any) => a.id));
    const sessIds = new Set((overview.activeSessions || []).map((s: any) => s.id));

    assert.ok(actIds.has(`act_friend_${suffix}`), 'Friend activity should be visible');
    assert.equal(actIds.has(`act_stranger_${suffix}`), false, 'Stranger activity must be hidden');
    assert.equal(actIds.has(`act_blocked_${suffix}`), false, 'Blocked user activity must be hidden');
    assert.equal(sessIds.has(privateOtherSess.id), false, 'Foreign private squad session must be hidden');
  });

  it('4. sheetHubWriteWorker neutralizes leading formula trigger characters while keeping numbers/booleans intact', async () => {
    let sentData: any[] = [];
    const mockFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sentData = JSON.parse(String(init?.body || '{}')).data;
      return new Response(JSON.stringify({ totalUpdatedCells: 6, responses: [] }), { status: 200 });
    }) as typeof fetch;

    await pushSheetHubCellUpdates(
      {
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        updates: [
          { sheetTitle: 'Sheet1', rowNumber: 2, colLetter: 'A', value: '=CMD()' },
          { sheetTitle: 'Sheet1', rowNumber: 2, colLetter: 'B', value: '+1+2' },
          { sheetTitle: 'Sheet1', rowNumber: 2, colLetter: 'C', value: '-danger' },
          { sheetTitle: 'Sheet1', rowNumber: 2, colLetter: 'D', value: '@SUM(A1)' },
          { sheetTitle: 'Sheet1', rowNumber: 2, colLetter: 'E', value: -42 },
          { sheetTitle: 'Sheet1', rowNumber: 2, colLetter: 'F', value: true },
        ],
      },
      'ya29.write_tok',
      mockFetch
    );

    assert.deepEqual(
      sentData.map((d) => d.values[0][0]),
      ["'=CMD()", "'+1+2", "'-danger", "'@SUM(A1)", -42, true]
    );
  });

  it('5. POST /api/sheet-hub/apps-script-writeback rejects unowned connectionId even when req.body.userId is omitted or matches caller', async () => {
    const tokenA = makeAuthToken('usr_as_owner_A');

    const omitRes = await fetch(`${baseUrl}/api/sheet-hub/apps-script-writeback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        connectionId: 'conn_victim_B',
        spreadsheetId: 'FocusFlow Writeback Test',
        sheetTitle: 'COA',
        rowNumber: 4,
        colLetter: 'D',
        value: true,
      }),
    });
    assert.equal(omitRes.status, 403);
    assert.equal(((await omitRes.json()) as any).code, 'TENANT_ISOLATION_VIOLATION');

    const selfSpoofRes = await fetch(`${baseUrl}/api/sheet-hub/apps-script-writeback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        connectionId: 'conn_victim_B',
        userId: 'usr_as_owner_A',
        spreadsheetId: 'FocusFlow Writeback Test',
        sheetTitle: 'COA',
        rowNumber: 4,
        colLetter: 'D',
        value: true,
      }),
    });
    assert.equal(selfSpoofRes.status, 403);
    assert.equal(((await selfSpoofRes.json()) as any).code, 'TENANT_ISOLATION_VIOLATION');
  });

  it('6 & 13c. ExamHallSimulator guards save effect until hydratedStorageKey matches, and Study/Planner/Avatar views scope localStorage keys by UID', () => {
    const simSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/study/ExamHallSimulator.tsx'), 'utf8');
    assert.ok(simSrc.includes('hydratedStorageKey'));
    assert.ok(simSrc.includes('if (hydratedStorageKey !== storageKey) return;'));

    const scopedFiles = [
      'src/components/study/SquadStudyRoom.tsx',
      'src/components/planner/SmartPlannerHubView.tsx',
      'src/components/avatar/AvatarStudioView.tsx',
      'src/components/avatar/AvatarQAView.tsx',
    ];
    for (const rel of scopedFiles) {
      const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      assert.ok(src.includes('activeUid'), `${rel} must scope storage key by activeUid`);
    }
  });

  it('7. formatPaiseForInput preserves fractional paise/cents and PUT /api/finance/expenses/:id resolves categoryName', async () => {
    assert.equal(formatPaiseForInput(12550), '125.50');
    assert.equal(formatPaiseForInput(12505), '125.05');
    assert.equal(formatPaiseForInput(50000), '500');
    assert.equal(toPaise(formatPaiseForInput(12550)), 12550);

    const uid = `usr_exp_cat_${Date.now()}`;
    const token = makeAuthToken(uid);
    const db = dbService.getRaw();
    dbService.ensureUserWorkspace(uid);
    const catA = { id: `cat_a_${Date.now()}`, userId: uid, name: 'Groceries', type: 'variable', icon: 'Tag', color: '#111111' } as any;
    const catB = { id: `cat_b_${Date.now()}`, userId: uid, name: 'Books & Study', type: 'variable', icon: 'Tag', color: '#222222' } as any;
    db.categories.push(catA, catB);
    const exp = {
      id: `exp_cat_${Date.now()}`,
      userId: uid,
      categoryId: catA.id,
      amountPaise: 12550,
      date: '2026-11-26',
      description: 'Original',
      type: 'variable',
      paymentMethod: 'upi_bank',
      createdAt: new Date().toISOString(),
    } as any;
    db.expenseTransactions.push(exp);

    const putRes = await fetch(`${baseUrl}/api/finance/expenses/${exp.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        description: 'Edited Book',
        amountPaise: 12550,
        categoryName: 'Books & Study',
      }),
    });
    assert.equal(putRes.status, 200);
    const updated = (await putRes.json()) as any;
    assert.equal(updated.categoryId, catB.id);
    assert.equal(updated.categoryName, 'Books & Study');
    assert.equal(updated.amountPaise, 12550);
  });

  it('8, 9 & 13b. vaultBackendService paginates getVaultSummary >100 docs, guards revokeVaultInvitation, and checks queryRes.ok', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    __setServiceAccountForTesting({
      client_email: 'test@focusflow-finance-prod.iam.gserviceaccount.com',
      private_key: pem,
      project_id: 'focusflow-finance-prod',
    });

    const contribDocs = Array.from({ length: 105 }, (_, i) => ({
      name: `projects/p/databases/(default)/documents/sharedVaults/v1/contributions/c_${i}`,
      fields: {
        id: { stringValue: `c_${i}` },
        vaultId: { stringValue: 'v1' },
        contributedByUid: { stringValue: 'u1' },
        contributedByName: { stringValue: 'Alice' },
        amountPaise: { integerValue: '100' },
        status: { stringValue: 'active' },
        date: { stringValue: '2026-11-01' },
        createdAt: { stringValue: '2026-11-01T00:00:00.000Z' },
      },
    }));

    let commitCalledOnMissingInvite = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
      }
      if (url.endsWith('/sharedVaults/v1')) {
        return new Response(
          JSON.stringify({
            name: '.../sharedVaults/v1',
            fields: {
              id: { stringValue: 'v1' },
              name: { stringValue: 'Paginated Vault' },
              createdBy: { stringValue: 'u1' },
              memberUids: { arrayValue: { values: [{ stringValue: 'u1' }] } },
              targetRatio: { mapValue: { fields: { u1: { integerValue: '100' } } } },
              status: { stringValue: 'active' },
              currency: { stringValue: 'INR' },
              targetPaise: { integerValue: '50000' },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/sharedVaults/v1/contributions')) {
        if (url.includes('pageToken=page_2')) {
          return new Response(JSON.stringify({ documents: contribDocs.slice(100) }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ documents: contribDocs.slice(0, 100), nextPageToken: 'page_2' }),
          { status: 200 }
        );
      }
      if (url.includes('/sharedVaults/v1/members')) {
        return new Response(
          JSON.stringify({
            documents: [
              {
                fields: {
                  uid: { stringValue: 'u1' },
                  name: { stringValue: 'Alice' },
                  email: { stringValue: 'a@b.com' },
                  role: { stringValue: 'owner' },
                  status: { stringValue: 'active' },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('/invitations/missing_inv')) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }
      if (url.includes('/invitations/accepted_inv')) {
        return new Response(
          JSON.stringify({
            name: '.../invitations/accepted_inv',
            updateTime: '2026-11-26T00:00:00Z',
            fields: { id: { stringValue: 'accepted_inv' }, status: { stringValue: 'accepted' } },
          }),
          { status: 200 }
        );
      }
      if (url.includes(':commit')) {
        commitCalledOnMissingInvite = true;
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes(':runQuery')) {
        return new Response(JSON.stringify({ error: { message: 'Backend down' } }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;

    const summary = await vaultBackendService.getVaultSummary('v1', 'u1');
    assert.ok(summary);
    assert.equal(summary.totalContributedPaise, 10500);
    assert.equal(summary.memberStats['u1']?.count, 105);

    await assert.rejects(
      () => vaultBackendService.revokeVaultInvitation('v1', 'missing_inv', { id: 'u1' }),
      (e: unknown) => e instanceof VaultServiceError && e.code === 'INVITATION_NOT_FOUND'
    );
    assert.equal(commitCalledOnMissingInvite, false);

    await assert.rejects(
      () => vaultBackendService.revokeVaultInvitation('v1', 'accepted_inv', { id: 'u1' }),
      (e: unknown) => e instanceof VaultServiceError && e.code === 'INVITATION_NOT_PENDING'
    );

    await assert.rejects(
      () => vaultBackendService.rejectVaultInvitation('CODE123', { id: 'u2', email: 'u2@x.com' }),
      (e: unknown) => e instanceof VaultServiceError && e.message.includes('Firestore query failed (500)')
    );
  });

  it('10 & 11. Habits API validates updates/toggles cleanly & Dashboard weeklyFocusMinutes uses user timezone', async () => {
    const uid = `usr_hab_tz_${Date.now()}`;
    const token = makeAuthToken(uid);
    const db = dbService.getRaw() as any;
    dbService.ensureUserWorkspace(uid);

    // Ensure Asia/Kolkata timezone on userSettings
    const us = db.userSettings.find((s: any) => s.userId === uid);
    if (us) us.timezone = 'Asia/Kolkata';

    // Habit creation & mass-assignment protection
    const createHab = await fetch(`${baseUrl}/api/habits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Read Paper' }),
    });
    assert.equal(createHab.status, 201);
    const habit = (await createHab.json()) as any;
    const origCreatedAt = habit.createdAt;

    const badPatch = await fetch(`${baseUrl}/api/habits/${habit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ completedDates: ['invalid-date'] }),
    });
    assert.equal(badPatch.status, 400);

    const massAssignAttempt = await fetch(`${baseUrl}/api/habits/${habit.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Updated Habit',
        deletedAt: '2020-01-01T00:00:00.000Z',
        createdAt: '1999-01-01T00:00:00.000Z',
      }),
    });
    assert.equal(massAssignAttempt.status, 200);
    const updatedHab = (await massAssignAttempt.json()) as any;
    assert.equal(updatedHab.deletedAt, null);
    assert.equal(updatedHab.createdAt, origCreatedAt);

    const badToggle = await fetch(`${baseUrl}/api/habits/${habit.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dateStr: '2026-02-30' }),
    });
    assert.equal(badToggle.status, 400);

    // Bug 11: Monday 00:30 AM IST equals Sunday 19:00:00Z in UTC!
    const todayIst = formatDateInTimezone(new Date().toISOString(), 'Asia/Kolkata');
    const weekStartMonday = getStartOfWeek(todayIst);
    // Compute Sunday UTC 19:00:00Z corresponding to Monday 00:30 IST
    const mondayUtcMidnight = new Date(`${weekStartMonday}T00:30:00+05:30`);
    db.focusSessions.push({
      id: `fs_tz_${Date.now()}`,
      userId: uid,
      mode: 'work',
      durationMinutes: 45,
      durationSeconds: 2700,
      actualDurationSeconds: 2700,
      completed: true,
      startedAt: mondayUtcMidnight.toISOString(),
      endedAt: new Date(mondayUtcMidnight.getTime() + 2700 * 1000).toISOString(),
    });

    const dashRes = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(dashRes.status, 200);
    const dash = (await dashRes.json()) as any;
    assert.equal(dash.weeklyFocusMinutes, 45);
  });

  it('12. V18StorageService chunks clearDoomscrollLogs into <=450 batch writes and replaces emergency_profile without merge', async () => {
    const batchCommitSizes: number[] = [];
    let setCalls: Array<{ data: any; options: any }> = [];

    const mockDocs = Array.from({ length: 1050 }, (_, i) => ({ ref: { id: `log_${i}` } }));
    const mockFirestore = {
      collection: () => ({
        doc: () => ({
          collection: (_sub: string) => ({
            doc: () => ({
              set: async (data: any, options?: any) => {
                setCalls.push({ data, options });
              },
            }),
            get: async () => ({ docs: mockDocs }),
          }),
        }),
      }),
      batch: () => {
        const ops: any[] = [];
        return {
          delete: (ref: any) => ops.push(ref),
          commit: async () => {
            batchCommitSizes.push(ops.length);
          },
        };
      },
    };

    const storage = new V18StorageService(mockFirestore);
    await storage.clearDoomscrollLogs('usr_batch_test');
    assert.deepEqual(batchCommitSizes, [450, 450, 150]);
    assert.ok(batchCommitSizes.every((s) => s <= 500));

    await storage.saveEmergencyProfile('usr_batch_test', {
      id: 'ep_usr_batch_test',
      userId: 'usr_batch_test',
      fullName: 'Alice',
      bloodGroup: undefined,
      primaryHospital: undefined,
      instructionsNote: undefined,
      accounts: [],
      policies: [],
      emergencyContacts: [],
      updatedAt: new Date().toISOString(),
    });

    assert.equal(setCalls.length, 1);
    assert.equal(setCalls[0].options, undefined, 'saveEmergencyProfile must NOT pass { merge: true }');
    assert.equal('bloodGroup' in setCalls[0].data, false);
  });

  it('13a. universalSheetsWorker public fetch error formats errorDetail.message instead of [object Object]', async () => {
    const mockFetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Rate Limit Exceeded' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () =>
        inspectPublicSpreadsheet(
          { spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
          mockFetch
        ),
      (err: unknown) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.message.includes('[object Object]'), false);
        assert.ok(err.message.includes('Rate Limit Exceeded') || err.message.includes('HTTP 500'));
        return true;
      }
    );
  });
});
