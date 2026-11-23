import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'path';
import os from 'os';

import app from '../server/serverless.ts';
import { DatabaseService, isVercelRuntime } from '../server/db.ts';
import { pushSheetHubCellUpdates } from '../server/sheetHubWriteWorker.ts';
import { generateOpenXmlWorkbook } from '../src/lib/openXmlSpreadsheet.ts';
import { getGisDualCopyToken, setGisDualCopyToken } from '../src/lib/googleAuthGis.ts';

function createValidJwt(uid: string, email = `${uid}@example.com`): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email,
      aud: 'focus-flow-by-atif',
      iss: 'https://securetoken.google.com/focus-flow-by-atif',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

function createSampleXlsxBytes(): Uint8Array {
  return generateOpenXmlWorkbook([
    {
      name: 'PublicSyllabus',
      columns: [
        { header: 'Unit', key: 'unit' },
        { header: 'Topic', key: 'topic' },
        { header: 'Done', key: 'done' },
      ],
      rows: [
        { unit: 'Unit 1', topic: 'Algorithms', done: 'TRUE' },
        { unit: 'Unit 1', topic: 'Data Structures', done: 'FALSE' },
      ],
    },
  ]);
}

describe('FocusFlow Sheet Hub — All Connection Modes & Security Test Suite', () => {
  let server: http.Server;
  let baseUrl = '';
  const origEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const testToken = createValidJwt('usr_verified_student');
  const validSheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

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
    process.env = { ...origEnv };
    globalThis.fetch = originalFetch;
  });

  describe('MODE A: Public Viewer Import (Zero OAuth)', () => {
    it('successfully inspects public spreadsheet without any Google OAuth token', async () => {
      const xlsxBytes = createSampleXlsxBytes();
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/export?format=xlsx')) {
          return new Response(xlsxBytes.slice(), {
            status: 200,
            headers: {
              'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'content-disposition': 'attachment; filename="PublicSyllabus.xlsx"',
            },
          });
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicAccess: true,
          spreadsheetId: validSheetId,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.spreadsheetId, validSheetId);
      assert.equal(data.title, 'PublicSyllabus');
      assert.equal(data.tabs.length, 1);
      assert.equal(data.tabs[0].sheetTitle, 'PublicSyllabus');
    });

    it('rejects public inspection if Google redirects to HTML login page (sheet is private)', async () => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/export?format=xlsx')) {
          return new Response('<!DOCTYPE html><html><body>Sign in to Google</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicAccess: true,
          spreadsheetId: validSheetId,
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'SHEET_PRIVATE_AUTH_REQUIRED');
      assert.ok(data.error.includes('Anyone with the link'));
    });

    it('successfully pulls data from public spreadsheet without OAuth', async () => {
      const xlsxBytes = createSampleXlsxBytes();
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/export?format=xlsx')) {
          return new Response(xlsxBytes.slice(), {
            status: 200,
            headers: {
              'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'content-disposition': 'attachment; filename="PublicSyllabus.xlsx"',
            },
          });
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicAccess: true,
          spreadsheetId: validSheetId,
          tabs: [{ sheetTitle: 'PublicSyllabus', sheetId: 0, headerRowIndex: 1 }],
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.spreadsheetId, validSheetId);
      assert.equal(data.tabs.length, 1);
      assert.equal(data.tabs[0].totalRows, 2);
    });
  });

  describe('MODE B & C: Private Read-Only and Two-Way Write Synchronization', () => {
    it('denies guest/unauthenticated user access to private inspect with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: validSheetId }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'AUTH_REQUIRED');
    });

    it('denies authenticated FocusFlow user if Google Access Token header is missing with 401 SHEETS_AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({ spreadsheetId: validSheetId }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'SHEETS_AUTH_REQUIRED');
    });

    it('denies guest/unauthenticated user from pushing cell updates with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/push-cells`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: validSheetId,
          updates: [{ sheetTitle: 'Syllabus', colLetter: 'C', rowNumber: 2, value: true }],
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'AUTH_REQUIRED');
    });

    it('denies push-cells without Google edit token header with 401 SHEETS_AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/push-cells`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          spreadsheetId: validSheetId,
          updates: [{ sheetTitle: 'Syllabus', colLetter: 'C', rowNumber: 2, value: true }],
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'SHEETS_AUTH_REQUIRED');
    });

    it('rejects push-cells with invalid spreadsheet ID with 400 INVALID_SPREADSHEET_ID', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/push-cells`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
          'x-google-access-token': 'ya29.sample-token',
        },
        body: JSON.stringify({
          spreadsheetId: 'too-short-id',
          updates: [{ sheetTitle: 'Syllabus', colLetter: 'C', rowNumber: 2, value: true }],
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.code, 'INVALID_SPREADSHEET_ID');
    });

    it('pushes permitted checkbox cell updates and deduplicates duplicate ranges', async () => {
      let capturedBody: any = null;
      const mockFetch: any = async (url: string, init?: RequestInit) => {
        if (url.includes('values:batchUpdate')) {
          capturedBody = JSON.parse(String(init?.body || '{}'));
          return new Response(JSON.stringify({ totalUpdatedCells: 1, responses: [{}] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      };

      const result = await pushSheetHubCellUpdates(
        {
          spreadsheetId: validSheetId,
          updates: [
            { sheetTitle: 'Topics', colLetter: 'C', rowNumber: 5, value: false },
            { sheetTitle: 'Topics', colLetter: 'C', rowNumber: 5, value: true }, // duplicate coordinate, last wins
          ],
        },
        'ya29.valid-sheets-token',
        mockFetch
      );

      assert.equal(result.spreadsheetId, validSheetId);
      assert.ok(capturedBody);
      assert.equal(capturedBody.data.length, 1);
      assert.equal(capturedBody.data[0].range, "'Topics'!C5");
      assert.deepEqual(capturedBody.data[0].values, [[true]]);
    });
  });

  describe('OAuth Error Handling & Upstream Disconnects', () => {
    it('returns 401 SHEETS_AUTH_REQUIRED when Google reports expired token or invalid credentials', async () => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('sheets.googleapis.com')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 401,
                message: 'Request had invalid authentication credentials. Expected OAuth 2 access token.',
                status: 'UNAUTHENTICATED',
              },
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
          'x-google-access-token': 'ya29.expired-or-wrong-project-token',
        },
        body: JSON.stringify({ spreadsheetId: validSheetId }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'SHEETS_AUTH_REQUIRED');
      assert.ok(data.error.includes('expired or missing'));
    });

    it('returns 403 SHEETS_PERMISSION_DENIED when Google reports insufficient scopes', async () => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('sheets.googleapis.com')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 403,
                message: 'Request had insufficient authentication scopes.',
                status: 'PERMISSION_DENIED',
              },
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
          'x-google-access-token': 'ya29.missing-scope-token',
        },
        body: JSON.stringify({ spreadsheetId: validSheetId }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'SHEETS_PERMISSION_DENIED');
      assert.ok(data.error.includes('Verify that your authorized Google account has permission'));
    });

    it('returns 404 SPREADSHEET_NOT_FOUND when Google reports spreadsheet does not exist', async () => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('sheets.googleapis.com')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 404,
                message: 'Requested entity was not found.',
                status: 'NOT_FOUND',
              },
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
          'x-google-access-token': 'ya29.valid-token',
        },
        body: JSON.stringify({ spreadsheetId: validSheetId }),
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.code, 'SPREADSHEET_NOT_FOUND');
    });

    it('returns 502 SHEETS_UPSTREAM_NETWORK_ERROR when network communication with Google fails', async () => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('sheets.googleapis.com')) {
          throw new TypeError('fetch failed: getaddrinfo ENOTFOUND sheets.googleapis.com');
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
          'x-google-access-token': 'ya29.valid-token',
        },
        body: JSON.stringify({ spreadsheetId: validSheetId }),
      });

      assert.equal(res.status, 502);
      const data = await res.json();
      assert.equal(data.code, 'SHEETS_UPSTREAM_NETWORK_ERROR');
      assert.ok(data.error.includes('Upstream network communication failed'));
    });
  });

  describe('MODE D: Dual-Copy & OAuth Credential Isolation', () => {
    it('isolates GIS Dual-Copy token in memory from Firebase Auth tokens', () => {
      setGisDualCopyToken('ya29.ghost-7b055-gis-token-test');
      assert.equal(getGisDualCopyToken(), 'ya29.ghost-7b055-gis-token-test');

      setGisDualCopyToken(null);
      assert.equal(getGisDualCopyToken(), null);
    });

    it('rejects drive-duplicate with forged ownerUid with 403 FORGED_OWNER_UID', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/drive-duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`, // sub: usr_verified_student
          'x-google-access-token': 'ya29.gis-token',
        },
        body: JSON.stringify({
          sourceSpreadsheetId: validSheetId,
          ownerUid: 'usr_malicious_attacker', // Mismatch!
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'FORGED_OWNER_UID');
    });
  });

  describe('Production & Vercel Database Safety Invariants', () => {
    it('never seeds default test user data into production or Vercel environments', () => {
      const tmpDir = path.join(os.tmpdir(), `test-prod-safety-${Date.now()}`);
      process.env.NODE_ENV = 'production';
      process.env.SEED_DEFAULT_DATA = 'true';

      const db = new DatabaseService(tmpDir);
      const users = db.getRaw().users;

      // Seed user "usr_atif_default" must NOT have been injected
      assert.equal(users.some((u: any) => u.id === 'usr_atif_default'), false);
    });
  });
});
