import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../api/index.ts';
import { PushNotificationService, pushNotificationService } from '../server/integrations/pushNotificationService.ts';
import { dbService } from '../server/db.ts';

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

describe('Firebase Cloud Messaging & Push Notification Service Suite', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    process.env.CRON_SECRET = 'test_cron_secret_high_entropy_12345';
    pushNotificationService.setFirestoreForTesting({
      collection: (col: string) => ({
        get: async () => ({ docs: [] }),
        doc: (docId: string) => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => {},
          collection: (subCol: string) => ({
            get: async () => ({ docs: [] }),
            doc: (subDocId: string) => ({
              get: async () => ({ exists: false, data: () => ({}) }),
              set: async () => {},
            }),
          }),
        }),
      }),
    });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) {
      server.close();
    }
  });

  const testUser = `usr_fcm_test_${Date.now()}`;
  const testToken = createValidToken(testUser);
  const guestUser = `gst_fcm_guest_${Date.now().toString(36)}`;

  describe('1. FCM Device Registration & Lifecycle Management', () => {
    it('registers a new device installation and updates Firestore', async () => {
      const service = new PushNotificationService();
      let savedDocId = '';
      let savedData: any = null;

      service.setFirestoreForTesting({
        collection: (col: string) => ({
          doc: (docId: string) => ({
            collection: (subCol: string) => ({
              doc: (instId: string) => {
                savedDocId = instId;
                return {
                  get: async () => ({ exists: false }),
                  set: async (data: any) => {
                    savedData = data;
                  },
                };
              },
            }),
          }),
        }),
      });

      const installation = await service.registerDevice(testUser, {
        token: 'fcm_registration_token_alpha_1234567890',
        installationId: 'inst_chrome_desktop_01',
        platform: 'web',
        userAgent: 'Mozilla/5.0 Test Chrome',
      });

      assert.equal(installation.installationId, 'inst_chrome_desktop_01');
      assert.equal(installation.token, 'fcm_registration_token_alpha_1234567890');
      assert.equal(savedDocId, 'inst_chrome_desktop_01');
      assert.equal(savedData.platform, 'web');
      assert.ok(savedData.lastSeenAt);
    });

    it('rejects device registration for guest sessions', async () => {
      const service = new PushNotificationService();

      await assert.rejects(
        async () => {
          await service.registerDevice(guestUser, {
            token: 'fcm_token_guest',
          });
        },
        /Authenticated user required for device registration/
      );
    });

    it('unregisters a device by installationId', async () => {
      const service = new PushNotificationService();
      let deletedDocId = '';

      service.setFirestoreForTesting({
        collection: (col: string) => ({
          doc: (docId: string) => ({
            collection: (subCol: string) => ({
              doc: (instId: string) => ({
                get: async () => ({ exists: true }),
                delete: async () => {
                  deletedDocId = instId;
                },
              }),
            }),
          }),
        }),
      });

      const result = await service.unregisterDevice(testUser, 'inst_chrome_desktop_01');
      assert.equal(result, true);
      assert.equal(deletedDocId, 'inst_chrome_desktop_01');
    });

    it('returns active device count and registration status', async () => {
      const service = new PushNotificationService();

      service.setFirestoreForTesting({
        collection: (col: string) => ({
          doc: (docId: string) => ({
            collection: (subCol: string) => ({
              get: async () => ({
                docs: [
                  {
                    id: 'inst_1',
                    data: () => ({
                      installationId: 'inst_1',
                      token: 'tok_1',
                      platform: 'web',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    }),
                  },
                  {
                    id: 'inst_2',
                    data: () => ({
                      installationId: 'inst_2',
                      token: 'tok_2',
                      platform: 'mobile_web',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    }),
                  },
                ],
              }),
            }),
          }),
        }),
      });

      const status = await service.getDeviceStatus(testUser);
      assert.equal(status.enabled, true);
      assert.equal(status.deviceCount, 2);
      assert.equal(status.devices.length, 2);
    });
  });

  describe('2. Push Notification Preference Suppression', () => {
    it('suppresses push dispatch when category is disabled in user notification preferences', async () => {
      const service = new PushNotificationService();
      
      // Ensure user workspace with disabled budget alerts in dbService
      dbService.ensureUserWorkspace(testUser);
      const rawDb = dbService.getRaw();
      const sIdx = rawDb.userSettings.findIndex((s) => s.userId === testUser);
      if (sIdx >= 0) {
        rawDb.userSettings[sIdx] = {
          ...rawDb.userSettings[sIdx],
          notificationPrefs: {
            taskDeadlines: true,
            upcomingBills: true,
            overdueBills: true,
            focusCompletion: true,
            budgetWarnings: false, // Category disabled!
            syncFailures: true,
            studyReminders: true,
          } as any,
        };
      }

      const result = await service.sendNotification(testUser, {
        title: 'Budget Threshold Exceeded',
        body: 'You have spent 95% of your Dining budget',
        category: 'budget',
      });

      assert.equal(result.skipped, true);
      assert.equal(result.delivered, 0);
    });
  });

  describe('3. Scheduled Notification Idempotency via Delivery Ledger', () => {
    it('skips duplicate push dispatch if already recorded in delivery ledger today', async () => {
      const service = new PushNotificationService();
      const today = new Date().toISOString().slice(0, 10);

      service.setFirestoreForTesting({
        collection: (col: string) => ({
          get: async () => ({
            docs: [
              {
                id: testUser,
                data: () => ({ id: testUser, email: 'test@example.com' }),
              },
            ],
          }),
          doc: (docId: string) => ({
            collection: (subCol: string) => {
              if (subCol === 'notification_delivery_ledger') {
                return {
                  doc: (entryId: string) => ({
                    get: async () => ({
                      exists: true, // Already delivered!
                      data: () => ({ entryId, deliveredAt: new Date().toISOString() }),
                    }),
                    set: async () => {},
                  }),
                };
              }
              return {
                get: async () => ({ docs: [] }),
              };
            },
          }),
        }),
      });

      const result = await service.processScheduledNotifications();
      assert.ok(result);
      assert.equal(result.dispatchedCount, 0, 'No notification should be dispatched when ledger records prior delivery');
    });
  });

  describe('4. Cron Security & CRON_SECRET Verification', () => {
    it('rejects cron execution when Authorization header is missing with 401', async () => {
      const res = await fetch(`${baseUrl}/api/cron/notifications`, {
        method: 'POST',
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('CRON_SECRET'));
    });

    it('rejects cron execution with incorrect Bearer token with 401', async () => {
      const res = await fetch(`${baseUrl}/api/cron/notifications`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer wrong_token_value',
        },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('CRON_SECRET'));
    });

    it('accepts cron execution with valid Bearer CRON_SECRET and returns success timestamp', async () => {
      const res = await fetch(`${baseUrl}/api/cron/notifications`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.timestamp);
    });

    it('accepts cron execution with valid x-cron-secret header', async () => {
      const res = await fetch(`${baseUrl}/api/cron/notifications`, {
        method: 'GET',
        headers: {
          'x-cron-secret': process.env.CRON_SECRET!,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });
  });

  describe('5. Guest User Restriction on FCM Device Routes', () => {
    it('rejects guest session on POST /api/devices/fcm/register with 403 GUEST_ACCESS_DENIED', async () => {
      const res = await fetch(`${baseUrl}/api/devices/fcm/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-session': guestUser,
        },
        body: JSON.stringify({ token: 'test_token_123' }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'GUEST_ACCESS_DENIED');
    });

    it('rejects guest session on GET /api/devices/fcm/status with 403 GUEST_ACCESS_DENIED', async () => {
      const res = await fetch(`${baseUrl}/api/devices/fcm/status`, {
        headers: { 'x-demo-session': guestUser },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'GUEST_ACCESS_DENIED');
    });

    it('rejects guest session on POST /api/notifications/test with 403 GUEST_ACCESS_DENIED', async () => {
      const res = await fetch(`${baseUrl}/api/notifications/test`, {
        method: 'POST',
        headers: { 'x-demo-session': guestUser },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'GUEST_ACCESS_DENIED');
    });
  });
});
