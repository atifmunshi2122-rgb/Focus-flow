import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../api/index.ts';
import { encryptToken, decryptToken, resolveEncryptionKey } from '../server/crypto.ts';
import { GoogleCalendarService, googleCalendarService } from '../server/integrations/googleCalendarService.ts';
import { GOOGLE_DRIVE_SHEETS_SCOPES } from '../src/lib/googleAuthGis.ts';

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

describe('Google Calendar OAuth, Crypto & Route Security Suite', () => {
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

  const testUser = `usr_cal_test_${Date.now()}`;
  const testToken = createValidToken(testUser);
  const guestUser = `gst_cal_guest_${Date.now().toString(36)}`;

  describe('1. AES-256-GCM Cryptographic Token Storage', () => {
    it('encrypts and decrypts OAuth tokens accurately (roundtrip verification)', () => {
      const originalToken = 'ya29.a0AfH6SMD_SampleGoogleCalendarAccessToken_123456789';
      const encrypted = encryptToken(originalToken);

      assert.ok(encrypted.encrypted, 'Ciphertext must be generated');
      assert.ok(encrypted.iv, '12-byte IV must be generated');
      assert.ok(encrypted.tag, '16-byte auth tag must be generated');

      const decrypted = decryptToken(encrypted);
      assert.equal(decrypted, originalToken, 'Decrypted token must exactly match original');
    });

    it('generates unique IVs and ciphertexts for identical plaintext inputs', () => {
      const plaintext = 'ya29.sample_refresh_token_xyz';
      const enc1 = encryptToken(plaintext);
      const enc2 = encryptToken(plaintext);

      assert.notEqual(enc1.iv, enc2.iv, 'IVs must be distinct per encryption');
      assert.notEqual(enc1.encrypted, enc2.encrypted, 'Ciphertexts must be distinct due to random IV');
    });

    it('detects tampering with ciphertext and throws authentication error', () => {
      const plaintext = 'super_secret_refresh_token';
      const encrypted = encryptToken(plaintext);

      // Mutate one character in ciphertext
      const tamperedCiphertext = encrypted.encrypted.slice(0, -2) + (encrypted.encrypted.slice(-2) === 'aa' ? 'bb' : 'aa');
      const tampered = { ...encrypted, encrypted: tamperedCiphertext };

      assert.throws(
        () => decryptToken(tampered),
        /Unsupported state or unable to authenticate data|Authentication tag verification failed/i
      );
    });

    it('detects tampering with authTag and throws authentication error', () => {
      const plaintext = 'super_secret_refresh_token';
      const encrypted = encryptToken(plaintext);

      // Mutate auth tag
      const tamperedTag = encrypted.tag.slice(0, -2) + (encrypted.tag.slice(-2) === '00' ? '11' : '00');
      const tampered = { ...encrypted, tag: tamperedTag };

      assert.throws(
        () => decryptToken(tampered),
        /Unsupported state or unable to authenticate data|Authentication tag verification failed/i
      );
    });

    it('resolves consistent 32-byte key from INTEGRATION_ENCRYPTION_KEY', () => {
      const key1 = resolveEncryptionKey();
      const key2 = resolveEncryptionKey();
      assert.equal(key1.length, 32, 'Encryption key must be exactly 32 bytes (256 bits)');
      assert.deepEqual(key1, key2, 'Key resolution must be deterministic');
    });
  });

  describe('2. Google Calendar External Event Protection Policy', () => {
    it('strictly denies deletion of external Google Calendar events without FocusFlow link', async () => {
      const service = new GoogleCalendarService();
      
      // Mock firestore query to return empty docs (no FocusFlow link)
      service.setFirestoreForTesting({
        collection: (col: string) => ({
          doc: (docId: string) => ({
            collection: (subCol: string) => ({
              where: () => ({
                limit: () => ({
                  get: async () => ({ empty: true, docs: [] }),
                }),
              }),
            }),
          }),
        }),
      });

      await assert.rejects(
        async () => {
          await service.deleteEvent(testUser, 'external_google_event_id_9999');
        },
        (err: any) => {
          assert.equal(err.code, 'EXTERNAL_EVENT_PROTECTION');
          assert.match(err.message, /Cannot delete external Google Calendar events/i);
          return true;
        }
      );
    });
  });

  describe('3. OAuth Flow Initialization & State Nonce Invariants', () => {
    it('generates secure authorization URL with offline access and single-use state nonce', async () => {
      const service = new GoogleCalendarService();
      
      let storedStateId = '';
      let storedData: any = null;
      service.setFirestoreForTesting({
        collection: (colName: string) => {
          assert.equal(colName, 'oauth_states');
          return {
            doc: (docId: string) => {
              storedStateId = docId;
              return {
                set: async (data: any) => {
                  storedData = data;
                },
              };
            },
          };
        },
      });

      const result = await service.startOAuthFlow(testUser);
      assert.ok(result.authUrl.includes('accounts.google.com/o/oauth2/v2/auth'));
      assert.ok(result.authUrl.includes('access_type=offline'));
      assert.ok(result.authUrl.includes('prompt=consent'));
      assert.ok(result.authUrl.includes('response_type=code'));
      assert.ok(result.authUrl.includes('calendar.events'));
      assert.equal(result.stateId.length, 64, 'State ID must be 32 bytes hex (64 chars)');
      assert.equal(storedStateId, result.stateId);
      assert.equal(storedData.userId, testUser);
      assert.ok(storedData.expiresAt > Date.now());
    });
  });

  describe('4. Guest User Restriction on Calendar Routes', () => {
    it('rejects guest session on GET /api/integrations/google-calendar/oauth/start with 403 GUEST_ACCESS_DENIED', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/oauth/start`, {
        headers: { 'x-demo-session': guestUser },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'GUEST_ACCESS_DENIED');
    });

    it('rejects guest session on GET /api/integrations/google-calendar/status with 403 GUEST_ACCESS_DENIED', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/status`, {
        headers: { 'x-demo-session': guestUser },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'GUEST_ACCESS_DENIED');
    });

    it('rejects guest session on GET /api/integrations/google-calendar/events with 403 GUEST_ACCESS_DENIED', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/events`, {
        headers: { 'x-demo-session': guestUser },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'GUEST_ACCESS_DENIED');
    });

    it('rejects guest session on POST /api/integrations/google-calendar/sync/tasks with 403 GUEST_ACCESS_DENIED', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/sync/tasks`, {
        method: 'POST',
        headers: { 'x-demo-session': guestUser },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'GUEST_ACCESS_DENIED');
    });

    it('rejects invalid authentication token with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/status`, {
        headers: { Authorization: 'Bearer invalid_malformed_token_xyz' },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'AUTH_REQUIRED');
    });
  });

  describe('5. OAuth Callback Pop-up Bridge & Error Communication', () => {
    it('handles Google user cancellation / access_denied error with HTTP 400 and notifies popup opener', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/oauth/callback?error=access_denied`);
      assert.equal(res.status, 400);
      assert.equal(res.headers.get('content-type')?.includes('text/html'), true);
      const html = await res.text();
      assert.ok(html.includes('GOOGLE_CALENDAR_AUTH_ERROR'), 'HTML must emit GOOGLE_CALENDAR_AUTH_ERROR event');
      assert.ok(html.includes('access_denied'), 'HTML must include error details');
      assert.ok(html.includes('window.close()'), 'HTML must close popup');
    });

    it('handles missing authorization code with HTTP 400 JSON and error message', async () => {
      const res = await fetch(`${baseUrl}/api/integrations/google-calendar/oauth/callback?state=dummy_state_only`);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.code, 'INVALID_CALLBACK_PARAMS');
      assert.ok(json.error.includes('Missing code or state'));
    });
  });

  describe('6. Least-Privileged Scopes & Scope Isolation (Calendar vs Sheets)', () => {
    it('Calendar OAuth requests strictly least-privileged calendar.events scope', async () => {
      const service = new GoogleCalendarService();
      service.setFirestoreForTesting({
        collection: () => ({
          doc: () => ({
            set: async () => {},
          }),
        }),
      });

      const { authUrl } = await service.startOAuthFlow(testUser);
      const url = new URL(authUrl);
      const requestedScope = url.searchParams.get('scope') || '';

      // Must request calendar.events (Sensitive)
      assert.equal(requestedScope, 'https://www.googleapis.com/auth/calendar.events');

      // Invariant: Must NEVER request restricted scopes
      assert.ok(!requestedScope.includes('https://www.googleapis.com/auth/calendar '));
      assert.ok(!requestedScope.endsWith('/calendar'));
      assert.ok(!requestedScope.includes('drive'));
      assert.ok(!requestedScope.includes('spreadsheets'));
    });

    it('Sheets OAuth requests strictly spreadsheets and drive.file scopes (zero Calendar scopes)', () => {
      assert.deepEqual(GOOGLE_DRIVE_SHEETS_SCOPES, [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ]);

      // Invariant: Sheets must NEVER request full drive or calendar
      assert.ok(!GOOGLE_DRIVE_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/drive' as any));
      assert.ok(!GOOGLE_DRIVE_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/calendar' as any));
      assert.ok(!GOOGLE_DRIVE_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/calendar.events' as any));
    });
  });

  describe('7. Graceful Handling of Expired Refresh Tokens & Revocation', () => {
    it('marks connection as revoked when refresh token fails with 400 invalid_grant', async () => {
      const service = new GoogleCalendarService();
      let updatedData: any = null;

      const encRefresh = encryptToken('expired_or_revoked_refresh_token');

      service.setFirestoreForTesting({
        collection: (col: string) => ({
          doc: (docId: string) => ({
            collection: (subCol: string) => ({
              doc: (subDocId: string) => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    connected: true,
                    encryptedRefreshToken: encRefresh.encrypted,
                    refreshTokenIv: encRefresh.iv,
                    refreshTokenTag: encRefresh.tag,
                    tokenExpiresAt: Date.now() - 10000, // expired
                    revoked: false,
                  }),
                }),
                update: async (data: any) => {
                  updatedData = data;
                },
              }),
            }),
          }),
        }),
      });

      // Mock Google token endpoint returning invalid_grant
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com/token')) {
          return new Response(
            JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input);
      };

      try {
        const token = await service.getValidAccessToken('usr_revoked_test');
        assert.equal(token, null, 'Must return null when refresh token is rejected');
        assert.ok(updatedData, 'Must update integration document on revocation');
        assert.equal(updatedData.connected, false, 'connected must be flipped to false');
        assert.equal(updatedData.revoked, true, 'revoked must be flagged as true');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('listCalendars falls back gracefully to primary calendar when least-privileged scope returns 403', async () => {
      const service = new GoogleCalendarService();
      const encAccess = encryptToken('valid_access_token');

      service.setFirestoreForTesting({
        collection: (col: string) => ({
          doc: (docId: string) => ({
            collection: (subCol: string) => ({
              doc: (subDocId: string) => ({
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
            }),
          }),
        }),
      });

      // Mock calendarList endpoint returning 403
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('calendar/v3/users/me/calendarList')) {
          return new Response(
            JSON.stringify({ error: { code: 403, message: 'Insufficient Permission' } }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input);
      };

      try {
        const cals = await service.listCalendars('usr_test_fallback');
        assert.equal(cals.length, 1);
        assert.equal(cals[0].id, 'primary');
        assert.equal(cals[0].primary, true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('routes return HTTP 401 AUTH_EXPIRED when calendar access token is expired or revoked', async () => {
      const origGetAccessToken = googleCalendarService.getValidAccessToken.bind(googleCalendarService);
      (googleCalendarService as any).getValidAccessToken = async () => null;

      try {
        const res = await fetch(`${baseUrl}/api/integrations/google-calendar/sync/tasks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${testToken}`,
            'Content-Type': 'application/json',
          },
        });

        // Because token is expired / not connected, returns 401 with AUTH_EXPIRED
        assert.equal(res.status, 401);
        const json = (await res.json()) as { error: string; code: string };
        assert.equal(json.code, 'AUTH_EXPIRED');
        assert.ok(json.error.includes('expired') || json.error.includes('not connected'));
      } finally {
        (googleCalendarService as any).getValidAccessToken = origGetAccessToken;
      }
    });
  });
});
