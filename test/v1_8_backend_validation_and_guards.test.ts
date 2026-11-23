import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../server/serverless.ts';

function createValidToken(uid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: `${uid}@example.com`,
      aud: 'test-rules-project',
      iss: 'https://securetoken.google.com/test-rules-project',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

describe('v1.8.0 Backend Guards & Route Validation Suite', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
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

  const testUser = `usr_val_test_${Date.now()}`;
  const testToken = createValidToken(testUser);

  describe('1. v1.8.0 Feature Routes Strict Input Validation & Awaited Persistence', () => {
    it('POST /api/whiteboard rejects invalid dataUrl with 400', async () => {
      const res = await fetch(`${baseUrl}/api/whiteboard`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Malicious payload',
          dataUrl: 'javascript:alert(1)',
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json() as any;
      assert.ok(json.error.includes('Invalid whiteboard dataUrl'));
    });

    it('POST /api/whiteboard persists valid image dataUrl and returns 201', async () => {
      const res = await fetch(`${baseUrl}/api/whiteboard`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Architecture Diagram',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json() as any;
      assert.equal(json.title, 'Architecture Diagram');
      assert.equal(json.userId, testUser);
    });

    it('POST /api/skill-nodes rejects missing title with 400', async () => {
      const res = await fetch(`${baseUrl}/api/skill-nodes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tier: 2,
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json() as any;
      assert.ok(json.error.includes('title is required'));
    });

    it('POST /api/decisions rejects missing title with 400', async () => {
      const res = await fetch(`${baseUrl}/api/decisions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: 'career',
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json() as any;
      assert.ok(json.error.includes('title is required'));
    });

    it('POST /api/doomscroll-tax rejects non-positive minutes with 400', async () => {
      const res = await fetch(`${baseUrl}/api/doomscroll-tax`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          minutes: 0,
          distractionApp: 'Instagram',
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json() as any;
      assert.ok(json.error.includes('minutes is required'));
    });

    it('POST /api/time-capsules rejects missing unlockDate with 400', async () => {
      const res = await fetch(`${baseUrl}/api/time-capsules`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Letter to myself',
          content: 'Keep learning systems design',
        }),
      });

      assert.equal(res.status, 400);
      const json = await res.json() as any;
      assert.ok(json.error.includes('unlockDate are required'));
    });
  });

  describe('2. Service Account Guard on Calendar & Push Routes', () => {
    it('GET /api/devices/fcm/status returns 200 without crashing when service account is unconfigured', async () => {
      const res = await fetch(`${baseUrl}/api/devices/fcm/status`, {
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      });

      assert.equal(res.status, 200);
      const json = await res.json() as any;
      assert.equal(json.enabled, false);
      assert.equal(json.deviceCount, 0);
    });

    it('GET /api/integrations/google-calendar/status returns 200 without crashing when service account is unconfigured', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/status`, {
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      });

      assert.equal(res.status, 200);
      const json = await res.json() as any;
      assert.equal(json.connected, false);
      assert.equal(json.calendarId, 'primary');
    });

    it('POST /api/devices/fcm/register returns 503 when service account is missing', async () => {
      const res = await fetch(`${baseUrl}/api/devices/fcm/register`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'fcm_fake_token_123',
          installationId: 'inst_1',
        }),
      });

      assert.equal(res.status, 503);
      const json = await res.json() as any;
      assert.equal(json.code, 'SERVICE_UNAVAILABLE');
    });

    it('POST /api/devices/fcm/unregister returns 503 when service account is missing', async () => {
      const res = await fetch(`${baseUrl}/api/devices/fcm/unregister`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installationId: 'inst_1',
        }),
      });

      assert.equal(res.status, 503);
      const json = await res.json() as any;
      assert.equal(json.code, 'SERVICE_UNAVAILABLE');
    });

    it('GET /api/integrations/google-calendar/oauth/start returns 503 when service account is missing', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/oauth/start`, {
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      });

      assert.equal(res.status, 503);
      const json = await res.json() as any;
      assert.equal(json.code, 'SERVICE_UNAVAILABLE');
    });

    it('DELETE /api/integrations/google-calendar/connection returns 503 when service account is missing', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/connection`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      });

      assert.equal(res.status, 503);
      const json = await res.json() as any;
      assert.equal(json.code, 'SERVICE_UNAVAILABLE');
    });
  });
});
