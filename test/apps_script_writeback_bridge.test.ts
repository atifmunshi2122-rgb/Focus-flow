import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  toCanonicalJson,
  computeAppsScriptHmac,
  isSpreadsheetAllowlisted,
  dispatchAppsScriptWriteback,
  AppsScriptBridgeError,
} from '../server/appsScriptBridgeWorker.ts';
import { apiRouter } from '../server/routes.ts';

describe('FocusFlow Apps Script Write-Back Bridge & Security Invariants', () => {
  const TEST_SECRET = 'test_webhook_secret_f0c4sf10w_2026';
  const TEST_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycb_sample_test/exec';
  const ALLOWED_TEST_SPREADSHEET = 'FocusFlow Writeback Test';
  const FORBIDDEN_PROD_SPREADSHEET = 'coa_production_vault_987654321';

  // ==========================================================================
  // 1. CANONICAL JSON & HMAC-SHA256 SIGNATURE INVARIANTS
  // ==========================================================================
  describe('1. Canonical JSON & HMAC Signature Generation', () => {
    it('sorts keys lexicographically and strips any pre-existing signature field', () => {
      const payload = {
        value: true,
        sheetTitle: 'COA',
        action: 'write_cell',
        signature: 'should_be_stripped',
        colLetter: 'D',
        rowNumber: 5,
        timestamp: 1732000000000,
        spreadsheetId: ALLOWED_TEST_SPREADSHEET,
        nonce: 'nonce_abc123',
      };

      const canonical = toCanonicalJson(payload);
      assert.doesNotMatch(canonical, /"signature"/, 'Canonical JSON must never include the signature itself');

      const parsedKeys = Object.keys(JSON.parse(canonical));
      const sortedKeys = [...parsedKeys].sort();
      assert.deepEqual(parsedKeys, sortedKeys, 'Keys must be sorted in exact lexicographical order');
      assert.equal(
        canonical,
        '{"action":"write_cell","colLetter":"D","nonce":"nonce_abc123","rowNumber":5,"sheetTitle":"COA","spreadsheetId":"FocusFlow Writeback Test","timestamp":1732000000000,"value":true}'
      );
    });

    it('generates reproducible HMAC-SHA256 hex digest matching Apps Script implementation', () => {
      const canonicalString = '{"action":"write_cell","colLetter":"D","nonce":"test","rowNumber":4,"sheetTitle":"COA","spreadsheetId":"test","timestamp":1700000000000,"value":true}';
      const sig1 = computeAppsScriptHmac(canonicalString, TEST_SECRET);
      const sig2 = computeAppsScriptHmac(canonicalString, TEST_SECRET);

      assert.equal(sig1, sig2, 'HMAC must be strictly deterministic');
      assert.equal(sig1.length, 64, 'HMAC-SHA256 hex string must be exactly 64 characters');

      // Altering any character changes signature completely
      const tamperedString = canonicalString.replace('true', 'false');
      const tamperedSig = computeAppsScriptHmac(tamperedString, TEST_SECRET);
      assert.notEqual(sig1, tamperedSig, 'Tampered payload must produce distinct HMAC');
    });
  });

  // ==========================================================================
  // 2. SPREADSHEET ALLOWLISTING (PRODUCTION DATA PROTECTION)
  // ==========================================================================
  describe('2. Spreadsheet Allowlisting & Production Isolation', () => {
    it('permits the dedicated test spreadsheet', () => {
      assert.ok(isSpreadsheetAllowlisted(ALLOWED_TEST_SPREADSHEET));
      assert.ok(isSpreadsheetAllowlisted('sem3-syllabus-sample'));
    });

    it('strictly denies non-allowlisted and production spreadsheets', () => {
      assert.equal(isSpreadsheetAllowlisted(FORBIDDEN_PROD_SPREADSHEET), false);
      assert.equal(isSpreadsheetAllowlisted('random_unknown_sheet'), false);
    });

    it('rejects non-allowlisted spreadsheet during dispatch with 403 SPREADSHEET_NOT_ALLOWLISTED', async () => {
      await assert.rejects(
        () =>
          dispatchAppsScriptWriteback(
            {
              spreadsheetId: FORBIDDEN_PROD_SPREADSHEET,
              sheetTitle: 'COA',
              rowNumber: 4,
              colLetter: 'D',
              value: true,
            },
            { webAppUrl: TEST_WEBAPP_URL, secret: TEST_SECRET }
          ),
        (err: unknown) =>
          err instanceof AppsScriptBridgeError &&
          err.status === 403 &&
          err.code === 'SPREADSHEET_NOT_ALLOWLISTED'
      );
    });
  });

  // ==========================================================================
  // 3. BACKEND-ONLY DISPATCH & MOCK APPS SCRIPT VERIFICATION
  // ==========================================================================
  describe('3. Backend Dispatch & Real Value Write Verification', () => {
    it('dispatches TRUE cell update with valid HMAC signature and headers', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      const mockFetch: typeof fetch = async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = (init?.headers || {}) as Record<string, string>;
        capturedBody = JSON.parse(String(init?.body || '{}'));

        return new Response(
          JSON.stringify({
            success: true,
            updatedCell: 'COA!D4',
            value: true,
            updatedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await dispatchAppsScriptWriteback(
        {
          spreadsheetId: ALLOWED_TEST_SPREADSHEET,
          sheetTitle: 'COA',
          rowNumber: 4,
          colLetter: 'D',
          value: true,
        },
        {
          webAppUrl: TEST_WEBAPP_URL,
          secret: TEST_SECRET,
          fetchImpl: mockFetch,
        }
      );

      assert.equal(capturedUrl, TEST_WEBAPP_URL);
      assert.ok(capturedHeaders['X-FocusFlow-Signature']);
      assert.ok(capturedHeaders['X-FocusFlow-Timestamp']);
      assert.equal(capturedBody.action, 'write_cell');
      assert.equal(capturedBody.sheetTitle, 'COA');
      assert.equal(capturedBody.rowNumber, 4);
      assert.equal(capturedBody.colLetter, 'D');
      assert.equal(capturedBody.value, true);

      // Verify signature in body matches canonical HMAC
      const expectedSig = computeAppsScriptHmac(toCanonicalJson(capturedBody), TEST_SECRET);
      assert.equal(capturedBody.signature, expectedSig);

      assert.equal(result.success, true);
      assert.equal(result.updatedCell, 'COA!D4');
      assert.equal(result.value, true);
      assert.equal(result.bridgeMode, 'apps_script');
    });

    it('dispatches write with expectedIdentity composite keys and returns correctedRowNumber on drift', async () => {
      let capturedBody: any = null;

      const mockFetch: typeof fetch = async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body || '{}'));

        return new Response(
          JSON.stringify({
            success: true,
            updatedCell: 'COA!D15',
            value: true,
            rowNumber: 15,
            correctedRowNumber: 15,
            updatedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await dispatchAppsScriptWriteback(
        {
          spreadsheetId: ALLOWED_TEST_SPREADSHEET,
          sheetTitle: 'COA',
          rowNumber: 4,
          colLetter: 'D',
          value: true,
          expectedIdentity: {
            module: 'Digital Logic',
            topic: 'Binary Arithmetic',
            subtopic: 'Addition & Subtraction',
          },
        },
        {
          webAppUrl: TEST_WEBAPP_URL,
          secret: TEST_SECRET,
          fetchImpl: mockFetch,
        }
      );

      assert.deepEqual(capturedBody.expectedIdentity, {
        module: 'Digital Logic',
        topic: 'Binary Arithmetic',
        subtopic: 'Addition & Subtraction',
      });

      // Expected identity must be included in the canonical signature calculation
      const expectedSig = computeAppsScriptHmac(toCanonicalJson(capturedBody), TEST_SECRET);
      assert.equal(capturedBody.signature, expectedSig);

      assert.equal(result.success, true);
      assert.equal(result.updatedCell, 'COA!D15');
      assert.equal(result.correctedRowNumber, 15);
    });

    it('dispatches FALSE cell update when unmarking a topic in FocusFlow', async () => {
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.value, false);

        return new Response(
          JSON.stringify({
            success: true,
            updatedCell: 'COA!D4',
            value: false,
            updatedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await dispatchAppsScriptWriteback(
        {
          spreadsheetId: ALLOWED_TEST_SPREADSHEET,
          sheetTitle: 'COA',
          rowNumber: 4,
          colLetter: 'D',
          value: false,
        },
        {
          webAppUrl: TEST_WEBAPP_URL,
          secret: TEST_SECRET,
          fetchImpl: mockFetch,
        }
      );

      assert.equal(result.success, true);
      assert.equal(result.updatedCell, 'COA!D4');
      assert.equal(result.value, false);
    });

    it('handles Apps Script rejection (e.g. invalid signature, expired timestamp)', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid HMAC signature',
            code: 'INVALID_SIGNATURE',
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        () =>
          dispatchAppsScriptWriteback(
            {
              spreadsheetId: ALLOWED_TEST_SPREADSHEET,
              sheetTitle: 'COA',
              rowNumber: 4,
              colLetter: 'D',
              value: true,
            },
            {
              webAppUrl: TEST_WEBAPP_URL,
              secret: TEST_SECRET,
              fetchImpl: mockFetch,
            }
          ),
        (err: unknown) =>
          err instanceof AppsScriptBridgeError &&
          err.status === 401 &&
          err.code === 'INVALID_SIGNATURE'
      );
    });
  });

  // ==========================================================================
  // 4. AUTHENTICATED ENDPOINT & TENANT ISOLATION
  // ==========================================================================
  describe('4. Backend Authenticated Endpoint /api/sheet-hub/apps-script-writeback', () => {
    it('rejects unauthenticated guest requests with 401 AUTH_REQUIRED', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api', apiRouter);

      const server = app.listen(0);
      const address = server.address() as any;
      const port = address.port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/sheet-hub/apps-script-writeback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: 'conn_test',
            spreadsheetId: ALLOWED_TEST_SPREADSHEET,
            sheetTitle: 'COA',
            rowNumber: 4,
            colLetter: 'D',
            value: true,
          }),
        });

        assert.equal(res.status, 401);
        const data = await res.json() as any;
        assert.equal(data.code, 'AUTH_REQUIRED');
      } finally {
        server.close();
      }
    });

    it('rejects attempts to modify connection belonging to another user', async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        // Authenticated as User A
        (req as any).auth = { userId: 'usr_authenticated_A', isGuest: false };
        next();
      });
      app.use('/api', apiRouter);

      const server = app.listen(0);
      const address = server.address() as any;
      const port = address.port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/sheet-hub/apps-script-writeback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: 'conn_attacker',
            userId: 'usr_victim_B', // Spoofed victim user ID
            spreadsheetId: ALLOWED_TEST_SPREADSHEET,
            sheetTitle: 'COA',
            rowNumber: 4,
            colLetter: 'D',
            value: true,
          }),
        });

        assert.equal(res.status, 403);
        const data = await res.json() as any;
        assert.equal(data.code, 'TENANT_ISOLATION_VIOLATION');
      } finally {
        server.close();
      }
    });

    it('blocks unallowlisted spreadsheets before invoking Apps Script', async () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as any).auth = { userId: 'usr_authenticated_A', isGuest: false };
        next();
      });
      app.use('/api', apiRouter);

      const server = app.listen(0);
      const address = server.address() as any;
      const port = address.port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/sheet-hub/apps-script-writeback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: 'conn_userA_123',
            spreadsheetId: FORBIDDEN_PROD_SPREADSHEET,
            sheetTitle: 'COA',
            rowNumber: 4,
            colLetter: 'D',
            value: true,
          }),
        });

        assert.equal(res.status, 403);
        const data = await res.json() as any;
        assert.equal(data.code, 'SPREADSHEET_NOT_ALLOWLISTED');
      } finally {
        server.close();
      }
    });
  });
});

