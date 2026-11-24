import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GHOST_PROJECT_NUMBER,
  getGooglePickerApiKey,
  getGhostProjectNumber,
  GOOGLE_DRIVE_SHEETS_SCOPES,
} from '../src/lib/googleAuthGis.ts';
import { launchGoogleSpreadsheetPicker } from '../src/components/sheets-hub/GoogleSheetPickerModal.tsx';
import { duplicateGoogleDriveFile } from '../server/driveWorker.ts';

describe('Google Picker API Integration & Invariants (Mocked Tests)', () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const originalEnvPickerKey = process.env.VITE_GOOGLE_PICKER_API_KEY;

  beforeEach(() => {
    // Default test key for tests requiring picker execution
    process.env.VITE_GOOGLE_PICKER_API_KEY = 'test-picker-key-from-env';

    // Setup mock window with gapi and google.picker
    const mockView = {
      setMimeTypes: () => mockView,
      setMode: () => mockView,
      setIncludeFolders: () => mockView,
    };

    let builderConfig: any = {};
    let pickerCallback: any = null;

    const mockBuilder = {
      addView: (v: any) => {
        builderConfig.view = v;
        return mockBuilder;
      },
      setOAuthToken: (t: string) => {
        builderConfig.token = t;
        return mockBuilder;
      },
      setDeveloperKey: (k: string) => {
        builderConfig.apiKey = k;
        return mockBuilder;
      },
      setAppId: (id: string) => {
        builderConfig.appId = id;
        return mockBuilder;
      },
      setTitle: (t: string) => {
        builderConfig.title = t;
        return mockBuilder;
      },
      enableFeature: (f: any) => {
        builderConfig.feature = f;
        return mockBuilder;
      },
      setCallback: (cb: any) => {
        pickerCallback = cb;
        builderConfig.callback = cb;
        return mockBuilder;
      },
      build: () => ({
        setVisible: (v: boolean) => {
          builderConfig.visible = v;
        },
      }),
    };

    (globalThis as any).window = {
      gapi: {
        load: (api: string, opts: any) => {
          if (api === 'picker') opts.callback();
        },
      },
      google: {
        picker: {
          PickerBuilder: function () {
            return mockBuilder;
          },
          DocsView: function (viewId: any) {
            builderConfig.viewId = viewId;
            return mockView;
          },
          DocsViewMode: { LIST: 'LIST', GRID: 'GRID' },
          ViewId: { SPREADSHEETS: 'SPREADSHEETS' },
          Action: { PICKED: 'picked', CANCEL: 'cancel' },
          Feature: { SUPPORT_DRIVES: 'SUPPORT_DRIVES' },
          Response: { ACTION: 'action', DOCUMENTS: 'docs' },
          Document: { ID: 'id', NAME: 'name', URL: 'url' },
          // Test helper to simulate user actions
          __triggerCallback: (data: any) => {
            if (pickerCallback) pickerCallback(data);
          },
          __getBuilderConfig: () => builderConfig,
        },
      },
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    globalThis.fetch = originalFetch;
    if (originalEnvPickerKey !== undefined) {
      process.env.VITE_GOOGLE_PICKER_API_KEY = originalEnvPickerKey;
    } else {
      delete process.env.VITE_GOOGLE_PICKER_API_KEY;
    }
  });

  // --------------------------------------------------------------------------
  // 1. Picker Configuration & Project Number Verification
  // --------------------------------------------------------------------------
  it('1. configures PickerBuilder with focus-flow-by-atif Project Number (1010159085609) and developer key from env', async () => {
    assert.equal(GHOST_PROJECT_NUMBER, '1010159085609');
    assert.equal(getGhostProjectNumber(), '1010159085609');

    // Test missing environment variable throws clear configuration error
    delete process.env.VITE_GOOGLE_PICKER_API_KEY;
    assert.throws(
      () => getGooglePickerApiKey(),
      /Google Picker API key is missing\. Please configure VITE_GOOGLE_PICKER_API_KEY/
    );

    // Test with quotes and trimming
    process.env.VITE_GOOGLE_PICKER_API_KEY = '"test-env-picker-key-12345"';
    assert.equal(getGooglePickerApiKey(), 'test-env-picker-key-12345');

    let selectedDoc: any = null;
    await launchGoogleSpreadsheetPicker({
      accessToken: 'test-oauth-token',
      onSelect: (doc) => {
        selectedDoc = doc;
      },
    });

    const config = (globalThis as any).window.google.picker.__getBuilderConfig();
    assert.equal(config.appId, '1010159085609', 'Picker AppId must be numeric Google project number');
    assert.equal(config.token, 'test-oauth-token');
    assert.equal(config.apiKey, 'test-env-picker-key-12345');
    assert.equal(config.feature, 'SUPPORT_DRIVES');
    assert.equal(config.visible, true);
  });

  // --------------------------------------------------------------------------
  // 2. Picker Selection & Document Extraction
  // --------------------------------------------------------------------------
  it('2. extracts document ID, title, and URL upon user selection (Action.PICKED)', async () => {
    let selectedDoc: any = null;
    await launchGoogleSpreadsheetPicker({
      accessToken: 'test-oauth-token',
      onSelect: (doc) => {
        selectedDoc = doc;
      },
    });

    // Simulate user selecting a private spreadsheet
    (globalThis as any).window.google.picker.__triggerCallback({
      action: 'picked',
      docs: [
        {
          id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          name: 'Semester 3 Physics Syllabus',
          url: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
        },
      ],
    });

    assert.ok(selectedDoc, 'onSelect callback must be triggered');
    assert.equal(selectedDoc.id, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    assert.equal(selectedDoc.name, 'Semester 3 Physics Syllabus');
    assert.equal(selectedDoc.url, 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit');
  });

  // --------------------------------------------------------------------------
  // 3. Picker Cancellation
  // --------------------------------------------------------------------------
  it('3. invokes onCancel when the user dismisses the Google Picker dialog (Action.CANCEL)', async () => {
    let cancelled = false;
    await launchGoogleSpreadsheetPicker({
      accessToken: 'test-oauth-token',
      onSelect: () => {},
      onCancel: () => {
        cancelled = true;
      },
    });

    // Simulate user clicking cancel
    (globalThis as any).window.google.picker.__triggerCallback({
      action: 'cancel',
    });

    assert.equal(cancelled, true, 'onCancel must be called when user dismisses picker');
  });

  // --------------------------------------------------------------------------
  // 4. Selected Spreadsheet Propagation to Drive Duplication Pipeline
  // --------------------------------------------------------------------------
  it('4. propagates selected spreadsheet ID to Drive files.copy duplicate pipeline', async () => {
    const pickedSpreadsheetId = 'source-picked-sheet-999888777';
    let copyTargetCalled = '';
    let copyMethodCalled = '';

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes(`/drive/v3/files/${pickedSpreadsheetId}?fields=`)) {
        return new Response(JSON.stringify({ id: pickedSpreadsheetId, capabilities: { canCopy: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(`/drive/v3/files/${pickedSpreadsheetId}/copy`)) {
        copyTargetCalled = url;
        copyMethodCalled = init?.method || '';
        return new Response(
          JSON.stringify({
            id: 'drive-duplicate-file-12345',
            name: 'FocusFlow Copy — source-p',
            webViewLink: 'https://docs.google.com/spreadsheets/d/drive-duplicate-file-12345/edit',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ replies: [] }), { status: 200 });
    };

    const result = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId: pickedSpreadsheetId,
        title: 'FocusFlow Copy — source-p',
      },
      'valid-oauth-token-with-drive-file'
    );

    assert.equal(result.driveFileId, 'drive-duplicate-file-12345');
    assert.equal(copyMethodCalled, 'POST');
    assert.ok(copyTargetCalled.includes(pickedSpreadsheetId));
  });

  // --------------------------------------------------------------------------
  // 5. Verification of capabilities.canCopy
  // --------------------------------------------------------------------------
  it('5. respects capabilities.canCopy: rejects duplication when canCopy is false', async () => {
    const restrictedSheetId = 'source-restricted-no-copy-123';

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes(restrictedSheetId)) {
        return new Response(JSON.stringify({ id: restrictedSheetId, capabilities: { canCopy: false } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    await assert.rejects(
      async () => {
        await duplicateGoogleDriveFile(
          { sourceSpreadsheetId: restrictedSheetId },
          'test-token'
        );
      },
      (err: any) => {
        assert.equal(err.code, 'DRIVE_CANNOT_COPY');
        assert.ok(err.message.includes('canCopy: false'));
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // 6. Helpful Guidance on 404/403 for Un-Picked Private Sheets
  // --------------------------------------------------------------------------
  it('6. provides explicit Google Picker guidance when un-picked private spreadsheet returns 404', async () => {
    const unsharedSheetId = 'source-private-unshared-12345';

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/copy')) {
        return new Response(JSON.stringify({ error: { message: 'File not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    };

    await assert.rejects(
      async () => {
        await duplicateGoogleDriveFile(
          { sourceSpreadsheetId: unsharedSheetId },
          'test-token'
        );
      },
      (err: any) => {
        assert.equal(err.code, 'DRIVE_FILE_NOT_FOUND');
        assert.ok(
          err.message.includes('Browse My Google Drive') && err.message.includes('Google Picker'),
          'Error must explain how Google Picker grants authorization'
        );
        return true;
      }
    );
  });
});

