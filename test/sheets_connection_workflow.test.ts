import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  inspectSpreadsheet,
  SheetHubWorkerError,
  parseGoogleApiError,
} from '../server/universalSheetsWorker.ts';
import {
  duplicateGoogleDriveFile,
  clearDriveIdempotencyCache,
} from '../server/driveWorker.ts';
import {
  GOOGLE_DRIVE_SHEETS_SCOPES,
  requestGoogleDriveToken,
} from '../src/lib/googleAuthGis.ts';

describe('Google Sheets Connection & Drive Duplication Workflow Bug Fixes', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    clearDriveIdempotencyCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    clearDriveIdempotencyCache();
  });

  // ==========================================================================
  // BUG 1 — GOOGLE DRIVE FILE ACCESS & PRE-FLIGHT VERIFICATION
  // ==========================================================================
  describe('BUG 1 — Google Drive File Access & Pre-flight Verification', () => {
    it('1.1 verifies Drive file access via GET before attempting files.copy', async () => {
      const sourceId = 'test-private-spreadsheet-id-12345';
      const calls: string[] = [];

      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = init?.method || 'GET';
        calls.push(`${method} ${url}`);

        if (url.includes(`/drive/v3/files/${sourceId}?fields=`)) {
          return new Response(
            JSON.stringify({
              id: sourceId,
              name: 'My Private Sheet',
              capabilities: { canCopy: true },
              trashed: false,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.includes(`/drive/v3/files/${sourceId}/copy`)) {
          return new Response(
            JSON.stringify({
              id: 'copy-file-id-67890',
              name: 'FocusFlow Copy — test-pri',
              webViewLink: 'https://docs.google.com/spreadsheets/d/copy-file-id-67890/edit',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({}), { status: 200 });
      };

      const result = await duplicateGoogleDriveFile(
        { sourceSpreadsheetId: sourceId },
        'valid-mock-token'
      );

      assert.equal(result.driveFileId, 'copy-file-id-67890');
      // Assert that pre-flight GET happened strictly before copy POST
      const preflightIndex = calls.findIndex((c) => c.startsWith('GET') && c.includes(sourceId));
      const copyIndex = calls.findIndex((c) => c.startsWith('POST') && c.includes('/copy'));
      assert.ok(preflightIndex >= 0, 'Pre-flight GET check must be executed');
      assert.ok(copyIndex > preflightIndex, 'Pre-flight GET check must happen strictly before files.copy POST');
    });

    it('1.2 detects 404 in pre-flight and throws descriptive Google Picker guidance', async () => {
      const unpickedId = 'unpicked-private-sheet-12345';

      globalThis.fetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            error: {
              code: 404,
              message: 'File not found: unpicked-private-sheet-12345',
              errors: [{ reason: 'notFound', message: 'File not found' }],
            },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await duplicateGoogleDriveFile(
            { sourceSpreadsheetId: unpickedId },
            'valid-mock-token'
          );
        },
        (err: any) => {
          assert.equal(err.status, 404);
          assert.equal(err.code, 'DRIVE_FILE_NOT_FOUND');
          assert.ok(err.message.includes('Browse My Google Drive'));
          assert.ok(err.message.includes('Google Picker'));
          assert.ok(err.message.includes('drive.file'));
          return true;
        }
      );
    });

    it('1.3 rejects trashed source spreadsheets before copying', async () => {
      const trashedId = 'trashed-sheet-id-999888';

      globalThis.fetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            id: trashedId,
            name: 'Trashed Sheet',
            capabilities: { canCopy: true },
            trashed: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await duplicateGoogleDriveFile(
            { sourceSpreadsheetId: trashedId },
            'valid-mock-token'
          );
        },
        (err: any) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'DRIVE_FILE_TRASHED');
          assert.ok(err.message.includes('Google Drive trash'));
          return true;
        }
      );
    });

    it('1.4 ensures returned file ID matches requested source ID (integrity verification)', async () => {
      const requestedId = 'requested-sheet-id-11111';

      globalThis.fetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            id: 'mismatched-different-id-22222',
            capabilities: { canCopy: true },
            trashed: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await duplicateGoogleDriveFile(
            { sourceSpreadsheetId: requestedId },
            'valid-mock-token'
          );
        },
        (err: any) => {
          assert.equal(err.status, 502);
          assert.equal(err.code, 'DRIVE_ID_MISMATCH');
          return true;
        }
      );
    });
  });

  // ==========================================================================
  // BUG 2 — FALSE SUCCESS TOAST ELIMINATION
  // ==========================================================================
  describe('BUG 2 — False Success Toast Elimination in ConnectSheetWizard', () => {
    it('2.1 verifies wizard source code does not show success toast immediately on OAuth token', () => {
      const wizardCode = readFileSync(
        join(process.cwd(), 'src/components/sheets-hub/ConnectSheetWizard.tsx'),
        'utf-8'
      );

      // Verify that handleAuthorizeGoogleDriveDualCopy does not invoke showToast with success before runInspection
      const dualCopyMatch = wizardCode.match(
        /handleAuthorizeGoogleDriveDualCopy\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)finally/
      );
      assert.ok(dualCopyMatch, 'handleAuthorizeGoogleDriveDualCopy must exist');
      assert.ok(
        !dualCopyMatch[1].includes("showToast('Google Drive duplicate"),
        'Must NOT show premature success toast in handleAuthorizeGoogleDriveDualCopy'
      );

      // Verify that handleAuthorizeGoogleWrite does not invoke showToast before runInspection
      const writeMatch = wizardCode.match(
        /handleAuthorizeGoogleWrite\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)finally/
      );
      assert.ok(writeMatch, 'handleAuthorizeGoogleWrite must exist');
      assert.ok(
        !writeMatch[1].includes("showToast('Google Sheets edit"),
        'Must NOT show premature success toast in handleAuthorizeGoogleWrite'
      );

      // Verify that handleAuthorizeGoogleReadOnly does not invoke showToast before runInspection
      const readOnlyMatch = wizardCode.match(
        /handleAuthorizeGoogleReadOnly\s*=\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)finally/
      );
      assert.ok(readOnlyMatch, 'handleAuthorizeGoogleReadOnly must exist');
      assert.ok(
        !readOnlyMatch[1].includes("showToast('Google Sheets read-only"),
        'Must NOT show premature success toast in handleAuthorizeGoogleReadOnly'
      );

      // Verify that success toast is inside runInspection after successful inspection
      const inspectMatch = wizardCode.match(/const runInspection\s*=\s*async[\s\S]*?finally/);
      assert.ok(inspectMatch, 'runInspection must exist');
      assert.ok(
        inspectMatch[0].includes('Successfully connected and inspected') &&
          inspectMatch[0].includes("'success'"),
        'runInspection must show success toast only upon verified inspection'
      );
    });

    it('2.2 verifies GIS Token Client validates granted scopes before resolving', async () => {
      let initConfig: any = null;

      (globalThis as any).window = {
        google: {
          accounts: {
            oauth2: {
              initTokenClient: (config: any) => {
                initConfig = config;
                return {
                  requestAccessToken: () => {
                    // Simulate Google returning a token that only granted spreadsheets, but denied drive.file
                    config.callback({
                      access_token: 'partial-scope-token',
                      expires_in: 3600,
                      scope: 'https://www.googleapis.com/auth/spreadsheets',
                      token_type: 'Bearer',
                    });
                  },
                };
              },
              hasGrantedAllScopes: (res: any, ...scopes: string[]) => {
                // Return false because drive.file was missing
                return false;
              },
            },
          },
        },
      };

      await assert.rejects(
        async () => {
          await requestGoogleDriveToken();
        },
        (err: any) => {
          assert.ok(
            err.message.includes('partial permissions') ||
              err.message.includes('Both Google Sheets and Google Drive permissions are required')
          );
          return true;
        }
      );
    });
  });

  // ==========================================================================
  // BUG 3 — STALE INSPECTION STATE HANDLING
  // ==========================================================================
  describe('BUG 3 — Stale Inspection State Handling in ConnectSheetWizard', () => {
    it('3.1 clears inspectData and selections when urlInput changes in UI', () => {
      const wizardCode = readFileSync(
        join(process.cwd(), 'src/components/sheets-hub/ConnectSheetWizard.tsx'),
        'utf-8'
      );

      const onChangeBlock = wizardCode.match(/onChange=\{\(e\)\s*=>\s*\{([\s\S]*?)\}\}/);
      assert.ok(onChangeBlock, 'urlInput onChange handler must exist');
      assert.ok(
        onChangeBlock[1].includes('setInspectData(null)'),
        'onChange must reset inspectData to null'
      );
      assert.ok(
        onChangeBlock[1].includes('setSelectedTabIds([])'),
        'onChange must reset selectedTabIds'
      );
    });

    it('3.2 clears inspectData at the beginning of runInspection and on error', () => {
      const wizardCode = readFileSync(
        join(process.cwd(), 'src/components/sheets-hub/ConnectSheetWizard.tsx'),
        'utf-8'
      );

      const runInspectionBlock = wizardCode.match(/const runInspection\s*=\s*async[\s\S]*?finally/);
      assert.ok(runInspectionBlock, 'runInspection must exist');

      // Verify setInspectData(null) at top
      assert.ok(
        runInspectionBlock[0].includes('setInspectData(null)'),
        'runInspection must clear inspectData at start'
      );

      // Verify catch block also cleans inspectData
      assert.ok(
        runInspectionBlock[0].includes('catch (err: any) {\n      setInspectData(null)'),
        'runInspection catch block must ensure inspectData is reset to null on failure'
      );
    });

    it('3.3 enforces inspectData.spreadsheetId === spreadsheetId in executeImportPipeline', () => {
      const wizardCode = readFileSync(
        join(process.cwd(), 'src/components/sheets-hub/ConnectSheetWizard.tsx'),
        'utf-8'
      );

      assert.ok(
        wizardCode.includes('inspectData.spreadsheetId !== spreadsheetId'),
        'executeImportPipeline must verify exact ID match between inspectData and selected spreadsheetId'
      );
    });
  });

  // ==========================================================================
  // BUG 4 — GENERIC 403 ERROR PRESERVATION & DIAGNOSTICS
  // ==========================================================================
  describe('BUG 4 — Generic 403 Error Elimination & Upstream Diagnostic Preservation', () => {
    it('4.1 parseGoogleApiError extracts Google structured status, message, and error reason', async () => {
      const mockGoogleError = {
        error: {
          code: 403,
          message: 'The caller does not have permission for spreadsheet 1BxiMV...',
          status: 'PERMISSION_DENIED',
          errors: [
            {
              message: 'The caller does not have permission',
              domain: 'global',
              reason: 'forbidden',
            },
          ],
        },
      };

      const res = new Response(JSON.stringify(mockGoogleError), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });

      const detail = await parseGoogleApiError(res);
      assert.equal(detail.status, 403);
      assert.equal(detail.message, 'The caller does not have permission for spreadsheet 1BxiMV...');
      assert.equal(detail.reason, 'forbidden');
      assert.equal(detail.domain, 'global');
    });

    it('4.2 inspectSpreadsheet maps 403 into SheetHubWorkerError preserving reason and upstream message', async () => {
      globalThis.fetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              message: 'Google Sheets API has not been used in project ghost-7b055 before',
              status: 'PERMISSION_DENIED',
              errors: [{ reason: 'accessNotConfigured' }],
            },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await inspectSpreadsheet(
            { spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' },
            'test-token'
          );
        },
        (err: any) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'SHEETS_PERMISSION_DENIED');
          assert.ok(err.message.includes('accessNotConfigured'));
          assert.ok(err.message.includes('Google Sheets API has not been used in project'));
          assert.equal(err.details?.reason, 'accessNotConfigured');
          return true;
        }
      );
    });

    it('4.3 duplicateGoogleDriveFile preserves 403 reason and upstream message during files.copy', async () => {
      const sourceId = 'valid-source-id-1234567890';

      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/copy')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 403,
                message: 'User rate limit exceeded for copying files',
                status: 'PERMISSION_DENIED',
                errors: [{ reason: 'userRateLimitExceeded' }],
              },
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        // Pre-flight succeeds
        return new Response(
          JSON.stringify({
            id: sourceId,
            capabilities: { canCopy: true },
            trashed: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await duplicateGoogleDriveFile(
            { sourceSpreadsheetId: sourceId },
            'valid-token'
          );
        },
        (err: any) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'DRIVE_PERMISSION_DENIED');
          assert.ok(err.message.includes('userRateLimitExceeded'));
          assert.ok(err.message.includes('User rate limit exceeded'));
          assert.equal(err.details?.reason, 'userRateLimitExceeded');
          return true;
        }
      );
    });

    it('4.4 verifies zero OAuth tokens or client secrets are logged during error reporting', () => {
      const forbiddenPattern = new RegExp(['G', 'O', 'C', 'S', 'P', 'X'].join('') + '-[A-Za-z0-9_-]+');
      const files = [
        'server/universalSheetsWorker.ts',
        'server/driveWorker.ts',
        'server/sheetsWorker.ts',
        'src/lib/googleAuthGis.ts',
      ];

      for (const rel of files) {
        const content = readFileSync(join(process.cwd(), rel), 'utf-8');
        assert.ok(!forbiddenPattern.test(content), `No OAuth client secret in ${rel}`);
        assert.ok(!content.includes('console.log(token'), `No token logging in ${rel}`);
        assert.ok(!content.includes('console.log(accessToken'), `No accessToken logging in ${rel}`);
      }
    });
  });

  // ==========================================================================
  // BUG 5 — DUAL-COPY SAFETY & IDEMPOTENCY
  // ==========================================================================
  describe('BUG 5 — Dual-Copy Safety & Idempotent Retry Handling', () => {
    it('5.1 returns cached duplicate on retry with identical idempotencyKey (zero duplicate files)', async () => {
      const sourceId = 'idempotent-test-source-sheet-123';
      let copyCallCount = 0;

      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/copy')) {
          copyCallCount++;
          return new Response(
            JSON.stringify({
              id: 'new-drive-file-abc-123',
              name: 'FocusFlow Copy',
              webViewLink: 'https://docs.google.com/spreadsheets/d/new-drive-file-abc-123/edit',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            id: sourceId,
            capabilities: { canCopy: true },
            trashed: false,
            sheets: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const key = 'test_idempotency_key_abc';

      // First call
      const res1 = await duplicateGoogleDriveFile(
        { sourceSpreadsheetId: sourceId, idempotencyKey: key },
        'token-1'
      );
      assert.equal(copyCallCount, 1);
      assert.equal(res1.driveFileId, 'new-drive-file-abc-123');

      // Second call (retry with same idempotency key)
      const res2 = await duplicateGoogleDriveFile(
        { sourceSpreadsheetId: sourceId, idempotencyKey: key },
        'token-1'
      );
      assert.equal(copyCallCount, 1, 'files.copy must NOT be called a second time on idempotent retry');
      assert.equal(res2.driveFileId, 'new-drive-file-abc-123');
      assert.equal(res2.createdAt, res1.createdAt);
    });

    it('5.2 rejects copy if Drive returns identical ID as source (preserving original isolation)', async () => {
      const sourceId = 'isolated-source-id-123456';

      globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
        const url = String(input);
        if (url.includes('/copy')) {
          // Faulty mock returning same ID
          return new Response(
            JSON.stringify({
              id: sourceId,
              name: 'Same ID',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            id: sourceId,
            capabilities: { canCopy: true },
            trashed: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await duplicateGoogleDriveFile(
            { sourceSpreadsheetId: sourceId },
            'token-1'
          );
        },
        (err: any) => {
          assert.equal(err.code, 'DRIVE_INVALID_COPY_ID');
          assert.ok(err.message.includes('identical file ID'));
          return true;
        }
      );
    });

    it('5.3 verifies ConnectSheetWizard requires driveFileId before creating native sheet', () => {
      const wizardCode = readFileSync(
        join(process.cwd(), 'src/components/sheets-hub/ConnectSheetWizard.tsx'),
        'utf-8'
      );

      const dualCopyPipeline = wizardCode.match(
        /if \(isDualCopy\) \{([\s\S]*?)await sheetHubStore\.createDualCopySpreadsheet/
      );
      assert.ok(dualCopyPipeline, 'Dual-Copy pipeline block must exist');

      // Verify driveDup call happens before createDualCopySpreadsheet
      assert.ok(
        dualCopyPipeline[1].includes('api.sheetHubDriveDuplicate'),
        'api.sheetHubDriveDuplicate must be called before createDualCopySpreadsheet'
      );
      assert.ok(
        dualCopyPipeline[1].includes('!driveDup || !driveDup.driveFileId'),
        'driveFileId must be strictly validated before creating native sheet'
      );
    });
  });

  // ==========================================================================
  // BUG 6 — IMPORT STATE & STEP 7 GATING
  // ==========================================================================
  describe('BUG 6 — Import State & Step 7 Confirmation Gating', () => {
    it('6.1 verifies Start Import button is disabled when inspection data is missing or mismatched', () => {
      const wizardCode = readFileSync(
        join(process.cwd(), 'src/components/sheets-hub/ConnectSheetWizard.tsx'),
        'utf-8'
      );

      // Verify the disabled prop on Start Import button
      const buttonMatch = wizardCode.match(
        /<ThemeButton[\s\S]*?onClick=\{executeImportPipeline\}[\s\S]*?disabled=\{([\s\S]*?)\}/
      );
      assert.ok(buttonMatch, 'Start Import ThemeButton must have a disabled prop');

      const disabledExpr = buttonMatch[1];
      assert.ok(disabledExpr.includes('!inspectData'), 'Button must be disabled when inspectData is null');
      assert.ok(
        disabledExpr.includes('inspectData.spreadsheetId !== spreadsheetId'),
        'Button must be disabled when spreadsheetId does not match inspectData.spreadsheetId'
      );
      assert.ok(
        disabledExpr.includes('selectedTabIds.length === 0'),
        'Button must be disabled when no tabs are selected'
      );
    });

    it('6.2 verifies Step 7 renders warning banner when spreadsheetId does not match inspectData', () => {
      const wizardCode = readFileSync(
        join(process.cwd(), 'src/components/sheets-hub/ConnectSheetWizard.tsx'),
        'utf-8'
      );

      assert.ok(
        wizardCode.includes('inspectData.spreadsheetId !== spreadsheetId') &&
          wizardCode.includes('Spreadsheet ID mismatch: inspected sheet'),
        'Step 7 must display a warning banner when spreadsheet ID does not match inspected data'
      );
    });
  });
});

