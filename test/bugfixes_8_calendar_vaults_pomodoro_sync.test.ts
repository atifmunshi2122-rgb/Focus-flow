import './test_bootstrap.ts';
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import app from '../server/serverless.ts';
import { encryptToken } from '../server/crypto.ts';
import { dbService } from '../server/db.ts';
import { GoogleCalendarService, googleCalendarService } from '../server/integrations/googleCalendarService.ts';
import { computePomodoroGoalProgress } from '../src/lib/pomodoroAnalytics.ts';
import { syncCoordinator } from '../src/lib/syncCoordinator.ts';
import { api } from '../src/lib/api.ts';
import { googleSheetsService } from '../src/lib/googleSheetsService.ts';

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

describe('Regression Suite for 8 Calendar, Vaults, Pomodoro & SyncCoordinator Bugs', () => {
  let server: http.Server;
  let baseUrl = '';
  const origFetch = globalThis.fetch;

  before(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    server?.close();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    googleCalendarService.setFirestoreForTesting(null);
    syncCoordinator.reset();
  });

  describe('Bug #1 & #5: JointVaultsView Create Modal availability & Debtor-only Settlement guards', () => {
    it('renders CreateJointVaultModal and JoinJointVaultModal in error and active views, not just empty state', () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/finance/JointVaultsView.tsx'),
        'utf8'
      );

      // Shared modal components defined
      assert.match(source, /const CreateJointVaultModal:/);
      assert.match(source, /title="Create Couple Joint Vault"/);

      // Rendered in loadError return branch alongside Retry button
      const errorBranchMatch = source.match(/Unable to Load Joint Vaults[\s\S]*?<CreateJointVaultModal[\s\S]*?<JoinJointVaultModal/);
      assert.ok(errorBranchMatch, 'loadError view must render CreateJointVaultModal and JoinJointVaultModal');

      // Rendered in active view (end of component, where + button calls setIsCreateModalOpen(true))
      const activeEndMatch = source.match(/Accessible from Active View[\s\S]*?<JoinJointVaultModal[\s\S]*?<CreateJointVaultModal[\s\S]*?\);\s*};/);
      assert.ok(activeEndMatch, 'Active view with vaults.length > 0 must render CreateJointVaultModal');
    });

    it('restricts UI Settlement button & submission to debtorUid and blocks self-settlement on backend', async () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/finance/JointVaultsView.tsx'),
        'utf8'
      );

      // UI guard inside handleRecordSettlement
      assert.match(source, /!user\?\.id \|\| user\.id !== debtorUid \|\| user\.id === creditorUid/);
      // UI banner renders Record Settlement button strictly for debtorUid and shows awaiting badge otherwise
      assert.match(source, /user\.id === settlement\.debtorUid && user\.id !== settlement\.creditorUid/);
      assert.match(source, /Awaiting payment from \{settlement\.debtorName\}/);
      // Confirm button disabled unless debtor
      assert.match(source, /disabled=\{!user\?\.id \|\| user\.id !== settlement\?\.debtorUid \|\| user\.id === settlement\?\.creditorUid\}/);

      // Backend enforcement in dbService.recordVaultSettlement & POST route
      const creditorUid = `usr_cred_${Date.now()}`;
      const debtorUid = `usr_debt_${Date.now()}`;
      const vault = dbService.createJointVault(
        { name: 'Joint Home Vault', targetPaise: 500000 },
        { id: creditorUid, name: 'Creditor Partner' }
      );
      const invite = dbService.createVaultInvitation(vault.id, { id: creditorUid, name: 'Creditor Partner' });
      dbService.acceptVaultInvitation(invite.inviteCode, { id: debtorUid, name: 'Debtor Partner' });

      // Creditor attempting to settle to themselves is rejected
      assert.throws(
        () =>
          dbService.recordVaultSettlement(
            vault.id,
            { id: creditorUid, name: 'Creditor Partner' },
            { toUid: creditorUid, toName: 'Creditor Partner', amountPaise: 10000 }
          ),
        /Cannot record a settlement payment to yourself/i
      );

      // HTTP route also rejects self-settlement
      const creditorToken = createValidToken(creditorUid);
      const res = await origFetch(`${baseUrl}/api/joint-vaults/${vault.id}/settlements`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creditorToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toUid: creditorUid,
          toName: 'Creditor Partner',
          amountPaise: 10000,
        }),
      });
      assert.equal(res.status >= 400 && res.status < 500, true, `Expected 4xx error for self-settlement, got ${res.status}`);

      // Debtor recording settlement TO creditor succeeds
      const okSettlement = dbService.recordVaultSettlement(
        vault.id,
        { id: debtorUid, name: 'Debtor Partner' },
        { toUid: creditorUid, toName: 'Creditor Partner', amountPaise: 10000 }
      );
      assert.equal(okSettlement.fromUid, debtorUid);
      assert.equal(okSettlement.toUid, creditorUid);
    });
  });

  describe('Bug #2: updateEvent External Protection, calendarId Precedence & Payload Sanitization', () => {
    it('rejects PATCH /api/integrations/google-calendar/events/:eventId for unlinked external event with 403 EXTERNAL_EVENT_PROTECTION', async () => {
      const userId = `usr_cal_upd_ext_${Date.now()}`;
      const token = createValidToken(userId);
      let outboundFetchCalled = false;

      googleCalendarService.setFirestoreForTesting({
        collection: () => ({
          doc: () => ({
            collection: () => ({
              where: () => ({
                limit: () => ({
                  get: async () => ({ empty: true, docs: [] }),
                }),
              }),
            }),
          }),
        }),
      });

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('127.0.0.1')) return origFetch(input, init);
        outboundFetchCalled = true;
        return new Response('{}', { status: 200 });
      };

      const res = await origFetch(`${baseUrl}/api/integrations/google-calendar/events/external_google_evt_777`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ summary: 'Hijacked Summary' }),
      });

      assert.equal(res.status, 403);
      const data = (await res.json()) as { code: string };
      assert.equal(data.code, 'EXTERNAL_EVENT_PROTECTION');
      assert.equal(outboundFetchCalled, false, 'Must not call Google Calendar API for external events');
    });

    it('preserves req.body.calendarId when query param omitted, prefers query param when both exist, and strips calendarId from PATCH body', async () => {
      const userId = `usr_cal_upd_ok_${Date.now()}`;
      const token = createValidToken(userId);
      const encAccess = encryptToken('valid_cal_access_token');

      googleCalendarService.setFirestoreForTesting({
        collection: () => ({
          doc: () => ({
            collection: (subCol: string) => {
              if (subCol === 'calendar_event_links') {
                return {
                  where: () => ({
                    limit: () => ({
                      get: async () => ({
                        empty: false,
                        docs: [
                          {
                            data: () => ({
                              sourceId: 'task_1',
                              googleEventId: 'linked_evt_1',
                              calendarId: 'linked_default@group.calendar.google.com',
                              managePolicy: 'focusflow_managed',
                            }),
                          },
                        ],
                      }),
                    }),
                  }),
                };
              }
              return {
                doc: () => ({
                  get: async () => ({
                    exists: true,
                    data: () => ({
                      connected: true,
                      encryptedAccessToken: encAccess.encrypted,
                      accessTokenIv: encAccess.iv,
                      accessTokenTag: encAccess.tag,
                      tokenExpiresAt: Date.now() + 3600000,
                      revoked: false,
                    }),
                  }),
                }),
              };
            },
          }),
        }),
      });

      const capturedCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('127.0.0.1')) return origFetch(input, init);
        const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
        capturedCalls.push({ url, body: parsedBody });
        return new Response(
          JSON.stringify({ id: 'linked_evt_1', summary: parsedBody.summary, start: { date: '2026-11-30' }, end: { date: '2026-12-01' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      // Case 1: body calendarId provided WITHOUT query parameter -> must NOT become 'primary' or leak into body
      const resBodyCal = await origFetch(`${baseUrl}/api/integrations/google-calendar/events/linked_evt_1`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: 'Team Study Sync',
          calendarId: 'work_team@group.calendar.google.com',
        }),
      });
      assert.equal(resBodyCal.status, 200);
      assert.equal(capturedCalls.length, 1);
      assert.ok(
        capturedCalls[0].url.includes('/calendars/work_team%40group.calendar.google.com/events/linked_evt_1'),
        `Expected body calendarId in URL, got ${capturedCalls[0].url}`
      );
      assert.equal('calendarId' in capturedCalls[0].body, false, 'Internal calendarId must be stripped from Google Calendar PATCH payload');
      assert.equal(capturedCalls[0].body.summary, 'Team Study Sync');

      // Case 2: query calendarId provided -> takes precedence over body calendarId, and also stripped from payload
      const resQueryCal = await origFetch(
        `${baseUrl}/api/integrations/google-calendar/events/linked_evt_1?calendarId=query_cal%40group.calendar.google.com`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary: 'Query Overrides Body',
            calendarId: 'body_cal@group.calendar.google.com',
          }),
        }
      );
      assert.equal(resQueryCal.status, 200);
      assert.equal(capturedCalls.length, 2);
      assert.ok(capturedCalls[1].url.includes('/calendars/query_cal%40group.calendar.google.com/events/linked_evt_1'));
      assert.equal('calendarId' in capturedCalls[1].body, false);
    });
  });

  describe('Bug #3: OAuth startOAuthFlow redirectUri Allowlist Validation', () => {
    it('rejects untrusted redirectUri origins, wrong paths, and query/hash payloads with 400 INVALID_REDIRECT_URI', async () => {
      const userId = `usr_cal_oauth_redir_${Date.now()}`;
      const token = createValidToken(userId);
      let stateWritten = false;

      const mockFs = {
        collection: () => ({
          doc: () => ({
            set: async () => {
              stateWritten = true;
            },
          }),
        }),
      };

      const service = new GoogleCalendarService(mockFs);
      googleCalendarService.setFirestoreForTesting(mockFs);

      const prevEnv = {
        NODE_ENV: process.env.NODE_ENV,
        APP_URL: process.env.APP_URL,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      };
      process.env.APP_URL = 'https://app.focusflow.example';
      process.env.ALLOWED_ORIGINS = 'https://preview.focusflow.example,*';

      try {
        // 1. Production mode: arbitrary external origin & HTTP localhost rejected via service
        process.env.NODE_ENV = 'production';
        await assert.rejects(
          () => service.startOAuthFlow(userId, 'https://evil.attacker.example/api/integrations/google-calendar/oauth/callback'),
          (err: any) => err.code === 'INVALID_REDIRECT_URI'
        );

        // Allowed origin but wrong path rejected
        await assert.rejects(
          () => service.startOAuthFlow(userId, 'https://app.focusflow.example/wrong-callback'),
          (err: any) => err.code === 'INVALID_REDIRECT_URI'
        );

        // Allowed origin with query string or credentials rejected
        await assert.rejects(
          () => service.startOAuthFlow(userId, 'https://app.focusflow.example/api/integrations/google-calendar/oauth/callback?leak=1'),
          (err: any) => err.code === 'INVALID_REDIRECT_URI'
        );

        // 2. Test HTTP route rejects untrusted origin & wrong path with 400 INVALID_REDIRECT_URI without writing state
        process.env.NODE_ENV = prevEnv.NODE_ENV;
        const badRes = await origFetch(
          `${baseUrl}/api/integrations/google-calendar/oauth/start?redirectUri=${encodeURIComponent('https://evil.example/steal')}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        assert.equal(badRes.status, 400);
        const badJson = (await badRes.json()) as { code: string };
        assert.equal(badJson.code, 'INVALID_REDIRECT_URI');
        assert.equal(stateWritten, false);

        // 3. Explicitly allowlisted APP_URL callback succeeds via HTTP route
        const okRes = await origFetch(
          `${baseUrl}/api/integrations/google-calendar/oauth/start?redirectUri=${encodeURIComponent('https://app.focusflow.example/api/integrations/google-calendar/oauth/callback')}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        assert.equal(okRes.status, 200);
        const okJson = (await okRes.json()) as { authUrl: string; stateId: string };
        assert.ok(okJson.authUrl.includes(encodeURIComponent('https://app.focusflow.example/api/integrations/google-calendar/oauth/callback')));
        assert.equal(stateWritten, true);
      } finally {
        process.env.NODE_ENV = prevEnv.NODE_ENV;
        if (prevEnv.APP_URL === undefined) delete process.env.APP_URL;
        else process.env.APP_URL = prevEnv.APP_URL;
        if (prevEnv.ALLOWED_ORIGINS === undefined) delete process.env.ALLOWED_ORIGINS;
        else process.env.ALLOWED_ORIGINS = prevEnv.ALLOWED_ORIGINS;
      }
    });
  });

  describe('Bug #4: disconnect() Firestore >500 Event Link Batch Chunking', () => {
    it('deletes 1,200 calendar_event_links in chunked batches <= 450 instead of exceeding Firestore 500-op limit', async () => {
      const deletedDocIds: string[] = [];
      const batchSizes: number[] = [];
      let integrationDeleted = false;

      const totalLinks = 1200;
      const fakeLinkDocs = Array.from({ length: totalLinks }, (_, idx) => ({
        id: `link_${idx}`,
        ref: { id: `link_${idx}` },
      }));

      const service = new GoogleCalendarService({
        collection: () => ({
          doc: () => ({
            collection: (subCol: string) => {
              if (subCol === 'integrations') {
                return {
                  doc: () => ({
                    get: async () => ({ exists: false, data: () => null }),
                    delete: async () => {
                      integrationDeleted = true;
                    },
                  }),
                };
              }
              return {
                get: async () => ({ docs: fakeLinkDocs }),
              };
            },
          }),
        }),
        batch: () => {
          const ops: Array<{ id: string }> = [];
          return {
            delete: (ref: { id: string }) => {
              ops.push(ref);
              if (ops.length > 500) {
                throw new Error('Firestore batch limit exceeded (>500 operations)');
              }
            },
            commit: async () => {
              batchSizes.push(ops.length);
              ops.forEach((o) => deletedDocIds.push(o.id));
            },
          };
        },
      });

      await service.disconnect('usr_chunk_test');

      assert.equal(integrationDeleted, true);
      assert.equal(deletedDocIds.length, totalLinks);
      assert.deepEqual(batchSizes, [450, 450, 300], 'Expected chunks of 450, 450, and 300 writes');
      assert.equal(Math.max(...batchSizes) <= 500, true);
    });
  });

  describe('Bug #6: syncTasks Exclusive All-Day End Date & User Timezone Support', () => {
    it('sets end.date = addDays(dueDate, 1) for all-day tasks and formats time blocks using user timezone + DST offset', async () => {
      const userId = `usr_cal_tz_${Date.now()}`;
      const encAccess = encryptToken('valid_sync_token');
      const linkWrites: Record<string, any> = {};
      const createdPayloads: any[] = [];

      const service = new GoogleCalendarService({
        collection: () => ({
          doc: () => ({
            collection: (subCol: string) => {
              if (subCol === 'integrations') {
                return {
                  doc: () => ({
                    get: async () => ({
                      exists: true,
                      data: () => ({
                        connected: true,
                        encryptedAccessToken: encAccess.encrypted,
                        accessTokenIv: encAccess.iv,
                        accessTokenTag: encAccess.tag,
                        tokenExpiresAt: Date.now() + 3600000,
                        revoked: false,
                      }),
                    }),
                    update: async () => undefined,
                  }),
                };
              }
              if (subCol === 'tasks') {
                return {
                  get: async () => ({
                    docs: [
                      {
                        data: () => ({
                          id: 'tsk_month_end',
                          title: 'Submit Gate Form',
                          dueDate: '2026-11-30',
                          priority: 'high',
                          status: 'todo',
                        }),
                      },
                    ],
                  }),
                };
              }
              if (subCol === 'time_blocks') {
                return {
                  get: async () => ({
                    docs: [
                      {
                        data: () => ({
                          id: 'tb_ny_winter',
                          title: 'Winter Deep Work',
                          date: '2026-11-30',
                          startMinute: 9 * 60,
                          endMinute: 10 * 60 + 30,
                          category: 'Study',
                          completed: false,
                        }),
                      },
                      {
                        data: () => ({
                          id: 'tb_ny_summer',
                          title: 'Summer Deep Work',
                          date: '2026-06-15',
                          startMinute: 9 * 60,
                          endMinute: 10 * 60,
                          category: 'Study',
                          completed: true,
                        }),
                      },
                    ],
                  }),
                };
              }
              if (subCol === 'settings') {
                return {
                  doc: (docId: string) => ({
                    get: async () => ({
                      exists: docId === 'default',
                      data: () => ({ timezone: 'America/New_York' }),
                    }),
                  }),
                };
              }
              if (subCol === 'calendar_event_links') {
                return {
                  get: async () => ({ docs: [] }),
                  doc: (id: string) => ({
                    set: async (data: any) => {
                      linkWrites[id] = data;
                    },
                  }),
                };
              }
              return { get: async () => ({ docs: [] }) };
            },
          }),
        }),
      });

      let eventSeq = 1;
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/events') && init?.method === 'POST') {
          const payload = JSON.parse(String(init.body));
          createdPayloads.push(payload);
          return new Response(
            JSON.stringify({ id: `g_evt_${eventSeq++}`, ...payload }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected fetch URL in syncTasks test: ${url}`);
      };

      const result = await service.syncTasks(userId, { calendarId: 'primary' });
      assert.equal(result.synced, 3);
      assert.equal(createdPayloads.length, 3);

      const taskEvent = createdPayloads.find((p) => p.summary === '[Task] Submit Gate Form');
      assert.ok(taskEvent);
      assert.deepEqual(taskEvent.start, { date: '2026-11-30' });
      assert.deepEqual(taskEvent.end, { date: '2026-12-01' }, 'All-day task end.date must be exclusive next calendar day');

      const winterBlock = createdPayloads.find((p) => p.summary === '[Focus Block] Winter Deep Work');
      assert.ok(winterBlock);
      assert.deepEqual(winterBlock.start, { dateTime: '2026-11-30T09:00:00-05:00', timeZone: 'America/New_York' });
      assert.deepEqual(winterBlock.end, { dateTime: '2026-11-30T10:30:00-05:00', timeZone: 'America/New_York' });

      const summerBlock = createdPayloads.find((p) => p.summary === '[Focus Block] Summer Deep Work');
      assert.ok(summerBlock);
      assert.deepEqual(summerBlock.start, { dateTime: '2026-06-15T09:00:00-04:00', timeZone: 'America/New_York' });
      assert.deepEqual(summerBlock.end, { dateTime: '2026-06-15T10:00:00-04:00', timeZone: 'America/New_York' });
      assert.equal(Boolean(linkWrites['tb_tb_ny_winter']), true);
    });
  });

  describe('Bug #7: PomodoroTimer Goal Progress Timezone & Modal Keyboard Shortcuts', () => {
    it('passes userTimezone in Focus Goals grid and blocks shortcuts during showManualLogModal / isTypingWarmupOpen', () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/focus/PomodoroTimer.tsx'),
        'utf8'
      );

      // Zero bare 2-arg computePomodoroGoalProgress(sessions, g) calls remain
      assert.equal(/computePomodoroGoalProgress\(sessions,\s*[a-zA-Z0-9_]+\)/.test(source), false);
      assert.match(source, /computePomodoroGoalProgress\(sessions,\s*g,\s*new Date\(\),\s*userTimezone\)/);

      // Both modal flags included in anyModalOpen & effect deps
      const modalBlockMatch = source.match(/const anyModalOpen =[\s\S]*?;/);
      assert.ok(modalBlockMatch);
      assert.match(modalBlockMatch[0], /showManualLogModal/);
      assert.match(modalBlockMatch[0], /isTypingWarmupOpen/);

      const keyEffectDepsMatch = source.match(/window\.addEventListener\('keydown', onKeyDown\);[\s\S]*?\]\);/);
      assert.ok(keyEffectDepsMatch);
      assert.match(keyEffectDepsMatch[0], /showManualLogModal/);
      assert.match(keyEffectDepsMatch[0], /isTypingWarmupOpen/);

      // Runtime proof that timezone changes daily goal bucket near UTC midnight
      const goal: any = {
        id: 'g1',
        title: 'Daily 30m',
        goalType: 'daily',
        metricType: 'focus_minutes',
        targetValue: 30,
        createdAt: '2026-11-26T00:00:00Z',
      };
      // 2026-11-26T19:00:00Z = Nov 27 00:30 IST, Nov 26 14:00 EST
      const refDate = new Date('2026-11-26T19:00:00Z');
      const sessions: any[] = [
        {
          id: 's1',
          userId: 'u1',
          mode: 'work',
          completed: true,
          durationSeconds: 1800,
          startedAt: '2026-11-26T18:45:00Z', // Nov 27 00:15 IST, Nov 26 13:45 EST
        },
      ];
      const nyProgress = computePomodoroGoalProgress(sessions, goal, refDate, 'America/New_York');
      const istProgress = computePomodoroGoalProgress(sessions, goal, refDate, 'Asia/Kolkata');
      assert.equal(nyProgress.currentValue, 30);
      assert.equal(istProgress.currentValue, 30);

      // At 2026-11-26T18:00:00Z (Nov 26 23:30 IST, Nov 26 13:00 EST), session at 19:00Z hasn't occurred yet;
      // check session at 18:40Z from reference 18:20Z? Better: session at 18:40Z checked at 18:55Z:
      // 18:55Z is Nov 27 00:25 IST, 18:40Z is Nov 27 00:10 IST; vs check a Nov 26 10:00Z session checked at 18:55Z:
      // In EST (Nov 26), Nov 26 10:00Z = Nov 26 05:00 EST (matches Nov 26!). In IST (Nov 27), Nov 26 10:00Z = Nov 26 15:30 IST (yesterday!).
      const crossMidnightSessions: any[] = [
        {
          id: 's_mid',
          userId: 'u1',
          mode: 'work',
          completed: true,
          durationSeconds: 1800,
          startedAt: '2026-11-26T10:00:00Z',
        },
      ];
      assert.equal(computePomodoroGoalProgress(crossMidnightSessions, goal, refDate, 'America/New_York').currentValue, 30);
      assert.equal(computePomodoroGoalProgress(crossMidnightSessions, goal, refDate, 'Asia/Kolkata').currentValue, 0);
    });
  });

  describe('Bug #8: SyncCoordinator.setCredentials(null, null) Full State Reset', () => {
    it('resets status, lastSyncedAt, lastError, and pendingCount to clean defaults and notifies listeners on logout/disconnect', async () => {
      const origEnqueue = googleSheetsService.enqueueMutation.bind(googleSheetsService);
      const origGetQueueLength = googleSheetsService.getQueueLength.bind(googleSheetsService);
      const origFlushQueue = googleSheetsService.flushQueue.bind(googleSheetsService);
      const origGetSyncQueue = api.getSyncQueue.bind(api);

      let fakeQueue: any[] = [];
      (googleSheetsService as any).enqueueMutation = async (_sheet: string, payload: unknown) => {
        fakeQueue.push({ id: `op_${fakeQueue.length + 1}`, payload, status: 'pending' });
      };
      (googleSheetsService as any).getQueueLength = () => fakeQueue.length;
      (api as any).getSyncQueue = async () => fakeQueue;

      const observedStates: ReturnType<typeof syncCoordinator.getState>[] = [];
      const unsubscribe = syncCoordinator.subscribe((state) => {
        observedStates.push(state);
      });

      try {
        // 1. Seed a synced state first so lastSyncedAt gets populated
        (googleSheetsService as any).flushQueue = async () => {
          const count = fakeQueue.length;
          fakeQueue = [];
          return count;
        };
        syncCoordinator.setCredentials('sheet_user_a', 'token_user_a');
        await syncCoordinator.syncMutation('Tasks', { id: 't1' }, 'append');
        assert.equal(syncCoordinator.getState().status, 'synced');
        assert.ok(syncCoordinator.getState().lastSyncedAt, 'lastSyncedAt should be populated after successful flush');

        // 2. Enqueue an operation that fails so lastError and pendingCount are non-zero/dirty
        (googleSheetsService as any).flushQueue = async () => {
          throw new Error('500 Upstream Sheets Outage');
        };
        await syncCoordinator.syncMutation('Tasks', { id: 't2' }, 'append');

        const dirtyState = syncCoordinator.getState();
        assert.equal(dirtyState.status, 'failed');
        assert.equal(dirtyState.pendingCount, 1);
        assert.match(dirtyState.lastError || '', /500 Upstream Sheets Outage/);
        assert.ok(dirtyState.lastSyncedAt, 'Prior lastSyncedAt should still be present before reset');

        // 3. Disconnect / Logout: setCredentials(null, null)
        syncCoordinator.setCredentials(null, null);

        const resetState = syncCoordinator.getState();
        assert.equal(resetState.status, 'idle');
        assert.equal(resetState.lastSyncedAt, null);
        assert.equal(resetState.lastError, null);
        assert.equal(resetState.pendingCount, 0);

        const lastEmitted = observedStates[observedStates.length - 1];
        assert.deepEqual(lastEmitted, resetState, 'Subscribers must receive reset state notification');
      } finally {
        unsubscribe();
        (googleSheetsService as any).enqueueMutation = origEnqueue;
        (googleSheetsService as any).getQueueLength = origGetQueueLength;
        (googleSheetsService as any).flushQueue = origFlushQueue;
        (api as any).getSyncQueue = origGetSyncQueue;
      }
    });
  });
});
