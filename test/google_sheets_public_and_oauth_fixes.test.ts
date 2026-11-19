import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  inspectPublicSpreadsheet,
  pullPublicSpreadsheetTabs,
  SheetHubWorkerError,
} from '../server/universalSheetsWorker.ts';
import { parseXlsxBuffer, isZipBuffer } from '../server/localXlsxParser.ts';
import {
  getAccessToken,
  getSheetHubAccessToken,
  setAccessToken,
  setSheetHubAccessToken,
} from '../src/lib/firebase.ts';
import { classifyFirebaseAuthError } from '../src/lib/authDiagnostics.ts';
import { generateOpenXmlWorkbook } from '../src/lib/openXmlSpreadsheet.ts';

function createSampleXlsxBytes(): Uint8Array {
  return generateOpenXmlWorkbook([
    {
      name: 'Syllabus',
      columns: [
        { header: 'Module', key: 'module' },
        { header: 'Topic', key: 'topic' },
        { header: 'Done', key: 'done' },
      ],
      rows: [
        { module: 'Unit 1', topic: 'Binary Trees', done: 'TRUE' },
        { module: 'Unit 1', topic: 'AVL Trees', done: 'FALSE' },
        { module: 'Unit 2', topic: 'Graph Traversal', done: 'TRUE' },
      ],
    },
    {
      name: 'Notes',
      columns: [
        { header: 'Title', key: 'title' },
        { header: 'Link', key: 'link' },
      ],
      rows: [{ title: 'Reference Guide', link: 'https://example.com/guide' }],
    },
  ]);
}

test('Public Link Parser — parseXlsxBuffer parses multi-tab OpenXML workbook cleanly', () => {
  const xlsxBuf = Buffer.from(createSampleXlsxBytes());
  assert.equal(isZipBuffer(xlsxBuf), true);
  assert.equal(isZipBuffer(Buffer.from('<!DOCTYPE html><html>Sign in</html>')), false);

  const tabs = parseXlsxBuffer(xlsxBuf);
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].sheetTitle, 'Syllabus');
  assert.equal(tabs[1].sheetTitle, 'Notes');
  assert.equal(tabs[0].rows.length, 4);
  assert.equal(tabs[0].rows[1][1].value, 'Binary Trees');
});

test('Public Link Inspect — extracts title, discovers all tabs, and infers headers without OAuth', async () => {
  const xlsxBytes = createSampleXlsxBytes();
  const mockFetch = async () =>
    new Response(xlsxBytes.slice(), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="Semester_Tracker.xlsx"',
      },
    });

  const result = await inspectPublicSpreadsheet(
    { spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit' },
    mockFetch as typeof fetch
  );

  assert.equal(result.spreadsheetId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  assert.equal(result.title, 'Semester_Tracker');
  assert.equal(result.tabs.length, 2);
  assert.equal(result.tabs[0].sheetTitle, 'Syllabus');
  assert.ok(result.tabs[0].columns.length >= 3);
});

test('Public Link Inspect — detects Google Sign-In HTML redirect on private sheets cleanly', async () => {
  const mockFetch = async () =>
    new Response('<!DOCTYPE html><html><title>Sign in - Google Accounts</title></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });

  await assert.rejects(
    () =>
      inspectPublicSpreadsheet(
        { spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
        mockFetch as typeof fetch
      ),
    (err: unknown) => {
      assert.ok(err instanceof SheetHubWorkerError);
      assert.equal(err.status, 403);
      assert.equal(err.code, 'SHEET_PRIVATE_AUTH_REQUIRED');
      return true;
    }
  );
});

test('Public Link Pull — pulls full rows for selected tabs without OAuth', async () => {
  const xlsxBytes = createSampleXlsxBytes();
  const mockFetch = async () =>
    new Response(xlsxBytes.slice(), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename*=UTF-8\'\'My%20Study%20Sheet.xlsx',
      },
    });

  const pulled = await pullPublicSpreadsheetTabs(
    {
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      tabs: [{ sheetTitle: 'Syllabus', headerRowIndex: 1 }],
    },
    mockFetch as typeof fetch
  );

  assert.equal(pulled.title, 'My Study Sheet');
  assert.equal(pulled.tabs.length, 1);
  assert.equal(pulled.tabs[0].sheetTitle, 'Syllabus');
  assert.equal(pulled.tabs[0].totalRows, 3);
  assert.equal(pulled.tabs[0].rows[0].values[1], 'Binary Trees');
});

test('Token Scope Isolation — read-only Sheet Hub token never leaks into write-scoped getAccessToken()', async () => {
  setAccessToken(null);
  setSheetHubAccessToken('ya29.readonly_sheet_hub_token');

  assert.equal(await getSheetHubAccessToken(), 'ya29.readonly_sheet_hub_token');
  assert.equal(
    await getAccessToken(),
    null,
    'Write-scoped getAccessToken() must NOT return a read-only Sheet Hub token'
  );

  setAccessToken('ya29.readwrite_executive_token');
  assert.equal(await getAccessToken(), 'ya29.readwrite_executive_token');

  // Cleanup
  setAccessToken(null);
  setSheetHubAccessToken(null);
});

test('Auth Diagnostics — resolves active Firebase project dynamically when no domain is in error text', () => {
  const config = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8')
  ) as { projectId: string };

  const diag = classifyFirebaseAuthError(
    new Error('Error 403: access_denied. Only developer-approved testers can access this app.'),
    {
      scopeMode: 'sheets',
      isIframe: false,
      hostname: 'localhost',
    }
  );

  assert.equal(diag.isTestingModeBlock, true);
  assert.ok(diag.summary.includes(config.projectId));
  assert.ok(diag.testUsersGuideHint?.includes(config.projectId));
});
