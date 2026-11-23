import './test_bootstrap.ts';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'fs';
import path from 'path';
import os from 'os';

import app from '../server/serverless.ts';
import { DatabaseService, resolveDefaultDataDir, isVercelRuntime } from '../server/db.ts';
import { generateOpenXmlWorkbook } from '../src/lib/openXmlSpreadsheet.ts';

function createValidJwt(uid: string, email = `${uid}@example.com`): string {
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

function createSampleXlsxBytes(): Uint8Array {
  return generateOpenXmlWorkbook([
    {
      name: 'PublicData',
      columns: [
        { header: 'Item', key: 'item' },
        { header: 'Cost', key: 'cost' },
      ],
      rows: [
        { item: 'Laptop', cost: '1200' },
        { item: 'Monitor', cost: '400' },
      ],
    },
  ]);
}

describe('Vercel Serverless Cold-Start, Filesystem Safety & Sheet Hub Inspection Suite', () => {
  let server: http.Server;
  let baseUrl = '';
  const origEnv = { ...process.env };

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
  });

  describe('1. Vercel Serverless Filesystem & Data Directory Resolution', () => {
    beforeEach(() => {
      delete process.env.DATA_DIR;
    });

    afterEach(() => {
      process.env = { ...origEnv };
    });

    it('detects Vercel runtime and routes data directory to os.tmpdir() when DATA_DIR is unset', () => {
      process.env.VERCEL = '1';
      delete process.env.DATA_DIR;

      assert.equal(isVercelRuntime(), true);
      const resolved = resolveDefaultDataDir();
      const expectedTmp = path.join(os.tmpdir(), 'focusflow-data');
      assert.equal(resolved, expectedTmp);

      const db = new DatabaseService();
      assert.equal(db.getDataDir(), expectedTmp);
      assert.ok(db.isHealthy());
    });

    it('preserves explicit DATA_DIR even in Vercel environment if explicitly provided', () => {
      process.env.VERCEL = '1';
      const customDir = path.join(os.tmpdir(), `test-explicit-data-${Date.now()}`);
      process.env.DATA_DIR = customDir;

      assert.equal(resolveDefaultDataDir(), customDir);
      const db = new DatabaseService();
      assert.equal(db.getDataDir(), customDir);
    });

    it('falls back to ./data in standard local/self-hosted development environments', () => {
      delete process.env.VERCEL;
      delete process.env.VERCEL_ENV;
      delete process.env.DATA_DIR;

      assert.equal(isVercelRuntime(), false);
      assert.equal(resolveDefaultDataDir(), path.resolve(process.cwd(), 'data'));
    });
  });

  describe('2. Read-Only Filesystem & Save Error Handling', () => {
    it('degrades safely without crashing when data directory cannot be created', () => {
      // Pass a path that cannot be created as a directory (pointing inside an existing file)
      const dummyFile = path.join(os.tmpdir(), `dummy-blocker-${Date.now()}`);
      fs.writeFileSync(dummyFile, 'blocking file');

      try {
        const invalidSubDir = path.join(dummyFile, 'cannot-create-dir');
        const db = new DatabaseService(invalidSubDir);

        assert.equal(db.isDegraded(), true);
        assert.ok(db.getPersistenceError());
        // In-memory data should still be initialized and accessible
        assert.ok(db.getRaw().categories.length > 0);
      } finally {
        if (fs.existsSync(dummyFile)) {
          fs.unlinkSync(dummyFile);
        }
      }
    });

    it('handles save failures gracefully without unhandled promise rejections', async () => {
      const dummyFile = path.join(os.tmpdir(), `dummy-blocker-${Date.now()}`);
      fs.writeFileSync(dummyFile, 'blocking file');

      try {
        const invalidSubDir = path.join(dummyFile, 'sub');
        const db = new DatabaseService(invalidSubDir);

        // Calling save directly should reject cleanly with PersistenceDegradedError
        await assert.rejects(
          async () => {
            await db.save();
          },
          /degraded/i
        );
      } finally {
        if (fs.existsSync(dummyFile)) {
          fs.unlinkSync(dummyFile);
        }
      }
    });
  });

  describe('3. CORS Headers & vercel.json Static Headers Alignment', () => {
    it('vercel.json includes x-google-access-token in Access-Control-Allow-Headers', () => {
      const vercelJsonPath = path.resolve(process.cwd(), 'vercel.json');
      assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');

      const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
      const apiHeaderRule = config.headers?.find((h: any) => h.source === '/api/(.*)');
      assert.ok(apiHeaderRule, 'Must contain header rule for /api/(.*)');

      const corsHeader = apiHeaderRule.headers?.find(
        (h: any) => h.key.toLowerCase() === 'access-control-allow-headers'
      );
      assert.ok(corsHeader, 'Must define Access-Control-Allow-Headers');
      assert.ok(
        corsHeader.value.includes('x-google-access-token'),
        'vercel.json must permit x-google-access-token header'
      );
    });

    it('OPTIONS preflight request returns Access-Control-Allow-Headers with x-google-access-token', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'x-google-access-token, content-type',
        },
      });

      assert.equal(res.status, 204);
      const allowHeaders = res.headers.get('Access-Control-Allow-Headers') || '';
      assert.ok(
        allowHeaders.includes('x-google-access-token'),
        `Access-Control-Allow-Headers (${allowHeaders}) must include x-google-access-token`
      );
    });
  });

  describe('4. Google Sheets Inspection (/api/sheet-hub/inspect)', () => {
    const testUser = `usr_sheets_test_${Date.now()}`;
    const testToken = createValidJwt(testUser);
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('inspects public spreadsheet without OAuth using publicAccess: true', async () => {
      const xlsxBytes = createSampleXlsxBytes();
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/export?format=xlsx')) {
          return new Response(xlsxBytes.slice(), {
            status: 200,
            headers: {
              'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'content-disposition': 'attachment; filename="PublicSheet.xlsx"',
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
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.spreadsheetId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
      assert.equal(data.title, 'PublicSheet');
      assert.ok(Array.isArray(data.tabs));
      assert.equal(data.tabs.length, 1);
      assert.equal(data.tabs[0].sheetTitle, 'PublicData');
    });

    it('rejects private spreadsheet inspect without FocusFlow authentication with 401 AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'AUTH_REQUIRED');
    });

    it('rejects private spreadsheet inspect without Google access token with 401 SHEETS_AUTH_REQUIRED', async () => {
      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({ spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.code, 'SHEETS_AUTH_REQUIRED');
    });

    it('inspects authenticated private spreadsheet successfully with mocked Google API', async () => {
      const mockSpreadsheetMeta = {
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        properties: { title: 'FocusFlow Financials 2026' },
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: 'Transactions',
              sheetType: 'GRID',
              gridProperties: { rowCount: 100, columnCount: 10 },
            },
          },
        ],
      };

      const mockGridResponse = {
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: 'Transactions',
              gridProperties: { rowCount: 100, columnCount: 10 },
            },
            data: [
              {
                rowData: [
                  {
                    values: [
                      { formattedValue: 'Date' },
                      { formattedValue: 'Category' },
                      { formattedValue: 'Description' },
                      { formattedValue: 'Amount' },
                    ],
                  },
                  {
                    values: [
                      { formattedValue: '2026-11-20' },
                      { formattedValue: 'Income' },
                      { formattedValue: 'Salary' },
                      { formattedValue: '150000' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('includeGridData=true')) {
          return new Response(JSON.stringify(mockGridResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')) {
          return new Response(JSON.stringify(mockSpreadsheetMeta), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(input, init);
      };

      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
          'x-google-access-token': 'ya29.sample-google-oauth-access-token',
        },
        body: JSON.stringify({
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          previewRows: 10,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.spreadsheetId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
      assert.equal(data.title, 'FocusFlow Financials 2026');
      assert.ok(Array.isArray(data.tabs));
      assert.equal(data.tabs.length, 1);
      assert.equal(data.tabs[0].sheetTitle, 'Transactions');
    });

    it('returns structured error without leaking Google OAuth access tokens when Google API fails', async () => {
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 403,
                message: 'The caller does not have permission',
                status: 'PERMISSION_DENIED',
              },
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      };

      const sensitiveToken = 'ya29.super-secret-oauth-bearer-token-123456';
      const res = await fetch(`${baseUrl}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testToken}`,
          'x-google-access-token': sensitiveToken,
        },
        body: JSON.stringify({ spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'SHEETS_PERMISSION_DENIED');
      assert.ok(data.error);

      // Verify token is never leaked in the error payload
      const jsonString = JSON.stringify(data);
      assert.equal(jsonString.includes(sensitiveToken), false);
    });
  });

  describe('5. Vercel Serverless Health Endpoints', () => {
    it('returns healthy status on /health and /api/health with vercel-serverless platform', async () => {
      const resRoot = await fetch(`${baseUrl}/health`);
      assert.equal(resRoot.status, 200);
      const dataRoot = await resRoot.json();
      assert.equal(dataRoot.status, 'healthy');
      assert.equal(dataRoot.platform, 'vercel-serverless');
      assert.equal(dataRoot.version, '1.8.0');

      const resApi = await fetch(`${baseUrl}/api/health`);
      assert.equal(resApi.status, 200);
      const dataApi = await resApi.json();
      assert.equal(dataApi.status, 'healthy');
      assert.equal(dataApi.platform, 'vercel-serverless');
    });

    it('returns JSON 404 for unknown endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/nonexistent-route-12345`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.ok(data.error.includes('not found'));
    });
  });
});
