import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  pushSheetHubCellUpdates,
  escapeSheetTitleForA1,
} from '../server/sheetHubWriteWorker.ts';
import { SheetHubWorkerError } from '../server/universalSheetsWorker.ts';
import {
  SHEET_HUB_READONLY_SCOPES,
  SHEET_HUB_WRITE_SCOPES,
  getAccessToken,
  setAccessToken,
  getSheetHubAccessToken,
  setSheetHubAccessToken,
  getSheetHubWriteAccessToken,
  setSheetHubWriteAccessToken,
} from '../src/lib/firebase.ts';

const VALID_SHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

describe('Universal Sheet Sync Hub — Two-Way Mark/Unmark Sync', () => {
  it('escapes sheet titles cleanly for Google Sheets A1 notation', () => {
    assert.equal(escapeSheetTitleForA1('Semester 3'), "'Semester 3'");
    assert.equal(escapeSheetTitleForA1("Atif's Tasks"), "'Atif''s Tasks'");
  });

  it('pushes real boolean true/false values via values:batchUpdate with USER_ENTERED', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedAuth = '';
    let capturedBody: any = null;

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = String(init?.method || 'GET');
      const headers = (init?.headers || {}) as Record<string, string>;
      capturedAuth = headers.Authorization || headers.authorization || '';
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

      return new Response(
        JSON.stringify({
          spreadsheetId: VALID_SHEET_ID,
          totalUpdatedCells: 2,
          responses: [{ updatedCells: 1 }, { updatedCells: 1 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const result = await pushSheetHubCellUpdates(
      {
        spreadsheetId: VALID_SHEET_ID,
        updates: [
          { sheetTitle: 'Math & DSA', rowNumber: 5, colLetter: 'd', value: true },
          { sheetTitle: "Atif's Plan", rowNumber: 12, colLetter: 'E', value: false },
        ],
      },
      'ya29.write_token_123',
      mockFetch
    );

    assert.equal(
      capturedUrl,
      `https://sheets.googleapis.com/v4/spreadsheets/${VALID_SHEET_ID}/values:batchUpdate`
    );
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedAuth, 'Bearer ya29.write_token_123');
    assert.equal(capturedBody.valueInputOption, 'USER_ENTERED');
    assert.deepEqual(capturedBody.data, [
      { range: "'Math & DSA'!D5", majorDimension: 'ROWS', values: [[true]] },
      { range: "'Atif''s Plan'!E12", majorDimension: 'ROWS', values: [[false]] },
    ]);
    assert.equal(result.updatedCells, 2);
    assert.equal(result.updatedRangeCount, 2);
    assert.equal(result.spreadsheetId, VALID_SHEET_ID);
  });

  it('deduplicates multiple updates to the same cell (last write wins)', async () => {
    let capturedBody: any = null;
    const mockFetch: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return new Response(JSON.stringify({ totalUpdatedCells: 1, responses: [{}] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await pushSheetHubCellUpdates(
      {
        spreadsheetId: VALID_SHEET_ID,
        updates: [
          { sheetTitle: 'Tasks', rowNumber: 3, colLetter: 'C', value: true },
          { sheetTitle: 'Tasks', rowNumber: 3, colLetter: 'C', value: false },
        ],
      },
      'ya29.write_token_456',
      mockFetch
    );

    assert.equal(capturedBody.data.length, 1);
    assert.deepEqual(capturedBody.data[0].values, [[false]]);
  });

  it('rejects missing OAuth token and invalid cell coordinates', async () => {
    await assert.rejects(
      () =>
        pushSheetHubCellUpdates(
          {
            spreadsheetId: VALID_SHEET_ID,
            updates: [{ sheetTitle: 'Tasks', rowNumber: 2, colLetter: 'A', value: true }],
          },
          ''
        ),
      (err: unknown) =>
        err instanceof SheetHubWorkerError &&
        err.status === 401 &&
        err.code === 'SHEETS_AUTH_REQUIRED'
    );

    await assert.rejects(
      () =>
        pushSheetHubCellUpdates(
          {
            spreadsheetId: VALID_SHEET_ID,
            updates: [{ sheetTitle: 'Tasks', rowNumber: 2, colLetter: '123', value: true }],
          },
          'ya29.valid'
        ),
      (err: unknown) =>
        err instanceof SheetHubWorkerError &&
        err.status === 400 &&
        err.code === 'INVALID_PUSH_REQUEST'
    );
  });

  it('maps Google 403 error to SHEETS_WRITE_PERMISSION_DENIED', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { code: 403, message: 'The caller does not have permission' } }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );

    await assert.rejects(
      () =>
        pushSheetHubCellUpdates(
          {
            spreadsheetId: VALID_SHEET_ID,
            updates: [{ sheetTitle: 'Tasks', rowNumber: 4, colLetter: 'D', value: true }],
          },
          'ya29.readonly_or_viewer',
          mockFetch
        ),
      (err: unknown) =>
        err instanceof SheetHubWorkerError &&
        err.status === 403 &&
        err.code === 'SHEETS_WRITE_PERMISSION_DENIED'
    );
  });

  it('maintains least-privilege write scopes and token isolation in firebase.ts', async () => {
    assert.deepEqual([...SHEET_HUB_READONLY_SCOPES], [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ]);
    assert.deepEqual([...SHEET_HUB_WRITE_SCOPES], [
      'https://www.googleapis.com/auth/spreadsheets',
    ]);

    setAccessToken(null);
    setSheetHubAccessToken(null);
    setSheetHubWriteAccessToken(null);

    // Read-only token must NEVER satisfy write token lookup
    setSheetHubAccessToken('ya29.readonly_only');
    assert.equal(await getSheetHubWriteAccessToken(), null);
    assert.equal(await getAccessToken(), null);

    // Write token satisfies Sheet Hub read & write, but does NOT leak into legacy workbook token
    setSheetHubAccessToken(null);
    setSheetHubWriteAccessToken('ya29.write_only');
    assert.equal(await getSheetHubWriteAccessToken(), 'ya29.write_only');
    assert.equal(await getSheetHubAccessToken(), 'ya29.write_only');
    assert.equal(await getAccessToken(), null);

    // Cleanup
    setSheetHubWriteAccessToken(null);
    setSheetHubAccessToken(null);
    setAccessToken(null);
  });

  it('POST /api/sheet-hub/push-cells rejects unauthenticated guest callers with 401 AUTH_REQUIRED', async () => {
    const { apiRouter } = await import('../server/routes.ts');
    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);

    const server = await new Promise<import('node:http').Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });

    try {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const res = await fetch(`http://127.0.0.1:${port}/api/sheet-hub/push-cells`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-session': 'gst_test_session_12345',
        },
        body: JSON.stringify({
          spreadsheetId: VALID_SHEET_ID,
          updates: [{ sheetTitle: 'Tasks', rowNumber: 2, colLetter: 'D', value: true }],
        }),
      });
      const json = (await res.json()) as { code?: string };
      assert.equal(res.status, 401);
      assert.equal(json.code, 'AUTH_REQUIRED');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('verifies SheetHubView requires explicit confirmAction before pushing cell updates', () => {
    const viewPath = path.resolve(process.cwd(), 'src/components/sheets-hub/SheetHubView.tsx');
    const src = fs.readFileSync(viewPath, 'utf8');
    assert.match(src, /confirmAction\s*\(\s*\{/);
    assert.match(src, /Sync to Google Sheet/);
    assert.match(src, /Push to Google Sheet/);
  });
});
