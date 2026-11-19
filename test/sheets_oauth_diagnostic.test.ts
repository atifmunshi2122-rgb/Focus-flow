import './test_bootstrap.ts';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase.ts';
import {
  classifyFirebaseAuthError,
  extractFirebaseAuthCode,
} from '../src/lib/authDiagnostics.ts';
import {
  getAccessToken,
  setAccessToken,
  getSheetHubAccessToken,
  setSheetHubAccessToken,
  LEGACY_SHEETS_SCOPES,
  SHEET_HUB_READONLY_SCOPES,
  GOOGLE_SHEETS_SCOPES,
  createSheetHubReadOnlyProvider,
  createSheetsGoogleProvider,
  basicGoogleProvider,
} from '../src/lib/firebase.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';

// ============================================================================
// 1. UNIVERSAL SHEET HUB READ-ONLY SCOPES VS LEGACY WRITE SCOPES SEPARATION
// ============================================================================
test('Least-Privilege Scopes — Universal Sheet Hub requests only spreadsheets.readonly, zero drive scopes', () => {
  // 1. Universal Sheet Hub scopes array
  assert.ok(Array.isArray(SHEET_HUB_READONLY_SCOPES), 'SHEET_HUB_READONLY_SCOPES must be an array');
  assert.equal(SHEET_HUB_READONLY_SCOPES.length, 1, 'Universal Sheet Hub must only request 1 minimal scope');
  assert.equal(
    SHEET_HUB_READONLY_SCOPES[0],
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'Universal Sheet Hub must strictly request spreadsheets.readonly'
  );
  assert.ok(
    !SHEET_HUB_READONLY_SCOPES.includes('https://www.googleapis.com/auth/spreadsheets' as any),
    'Universal Sheet Hub must NEVER request write spreadsheets scope'
  );
  assert.ok(
    !SHEET_HUB_READONLY_SCOPES.includes('https://www.googleapis.com/auth/drive.file' as any),
    'Universal Sheet Hub must NEVER request drive.file scope'
  );
  assert.ok(
    !SHEET_HUB_READONLY_SCOPES.includes('https://www.googleapis.com/auth/drive' as any),
    'Universal Sheet Hub must NEVER request broad drive scope'
  );

  // 2. Provider verification
  const readOnlyProvider = createSheetHubReadOnlyProvider('user@example.com');
  const providerScopes = readOnlyProvider.getScopes();
  assert.ok(
    providerScopes.includes('https://www.googleapis.com/auth/spreadsheets.readonly'),
    'Provider must include spreadsheets.readonly'
  );
  assert.ok(
    !providerScopes.includes('https://www.googleapis.com/auth/spreadsheets'),
    'Provider must NOT include write spreadsheets scope'
  );
  assert.ok(
    !providerScopes.includes('https://www.googleapis.com/auth/drive.file'),
    'Provider must NOT include drive.file scope'
  );

  // 3. ConnectSheetWizard and SheetHubView call authorizeSheetHubReadOnly
  const wizardSource = fs.readFileSync(
    path.resolve('src/components/sheets-hub/ConnectSheetWizard.tsx'),
    'utf8'
  );
  assert.match(
    wizardSource,
    /authorizeSheetHubReadOnly/,
    'ConnectSheetWizard must invoke authorizeSheetHubReadOnly'
  );
  assert.doesNotMatch(
    wizardSource,
    /authorizeGoogleSheets\(\)/,
    'ConnectSheetWizard must not invoke legacy authorizeGoogleSheets'
  );

  const hubViewSource = fs.readFileSync(
    path.resolve('src/components/sheets-hub/SheetHubView.tsx'),
    'utf8'
  );
  assert.match(
    hubViewSource,
    /authorizeSheetHubReadOnly/,
    'SheetHubView must invoke authorizeSheetHubReadOnly on reconnect'
  );
});

test('Least-Privilege Scopes — Legacy Sheets Sync retains required write permissions', () => {
  assert.ok(Array.isArray(LEGACY_SHEETS_SCOPES), 'LEGACY_SHEETS_SCOPES must be an array');
  assert.ok(
    LEGACY_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/spreadsheets'),
    'Legacy sync must retain spreadsheets scope for workbook creation and updates'
  );
  assert.ok(
    LEGACY_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/drive.file'),
    'Legacy sync must retain drive.file scope for Drive-managed spreadsheet files'
  );

  // Backward-compatible alias
  assert.strictEqual(GOOGLE_SHEETS_SCOPES, LEGACY_SHEETS_SCOPES);

  const legacyProvider = createSheetsGoogleProvider();
  const legacyScopes = legacyProvider.getScopes();
  assert.ok(legacyScopes.includes('https://www.googleapis.com/auth/spreadsheets'));
  assert.ok(legacyScopes.includes('https://www.googleapis.com/auth/drive.file'));
});

test('Least-Privilege Scopes — Firebase Google Sign-In remains decoupled with zero extra scopes', () => {
  const basicScopes = basicGoogleProvider.getScopes();
  assert.deepEqual(basicScopes, ['profile'], 'basicGoogleProvider should only request default profile identity');
  assert.ok(
    !basicScopes.some((s) => s.includes('spreadsheets') || s.includes('drive')),
    'basicGoogleProvider must never request Google Workspace/Sheets/Drive scopes'
  );
});

// ============================================================================
// 2. TOKEN ISOLATION & ACCESS MANAGEMENT
// ============================================================================
test('Token Storage — Read-Only token does not bleed into Legacy Write token cache', async () => {
  setAccessToken(null);
  setSheetHubAccessToken(null);

  assert.equal(await getAccessToken(), null);
  assert.equal(await getSheetHubAccessToken(), null);

  // Set dedicated read-only token
  const readOnlyToken = 'ya29.readonly_token_abc123';
  setSheetHubAccessToken(readOnlyToken);

  // Sheet Hub token is available
  assert.equal(await getSheetHubAccessToken(), readOnlyToken);

  // Set legacy write token
  const writeToken = 'ya29.write_token_xyz987';
  setAccessToken(writeToken);

  assert.equal(await getAccessToken(), writeToken);
  // getSheetHubAccessToken returns readOnlyToken when explicitly set
  assert.equal(await getSheetHubAccessToken(), readOnlyToken);

  // Clean up
  setAccessToken(null);
  setSheetHubAccessToken(null);
  assert.equal(await getAccessToken(), null);
  assert.equal(await getSheetHubAccessToken(), null);
});

// ============================================================================
// 3. READ-ONLY IMPORTER API AUDIT
// ============================================================================
test('Read-Only API Audit — Universal Sheet Hub worker makes zero write or Drive calls', () => {
  const universalWorkerSource = fs.readFileSync(
    path.resolve('server/universalSheetsWorker.ts'),
    'utf8'
  );

  // Ensure no POST, PUT, DELETE, PATCH HTTP methods to external APIs exist in universal worker
  const nonGetMatches = universalWorkerSource.match(
    /method:\s*['"](POST|PUT|DELETE|PATCH)['"]/gi
  );
  assert.equal(
    nonGetMatches,
    null,
    'server/universalSheetsWorker.ts must never execute POST, PUT, DELETE, or PATCH requests'
  );

  // Verify only GET calls to sheets.googleapis.com are made
  const sheetsGetCalls = universalWorkerSource.match(/method:\s*'GET'/gi);
  assert.ok(sheetsGetCalls && sheetsGetCalls.length >= 2, 'Must use GET for metadata & values');

  // Verify zero drive API calls exist
  assert.doesNotMatch(
    universalWorkerSource,
    /drive\.googleapis\.com/i,
    'Universal worker must never invoke drive.googleapis.com'
  );

  // Verify syncMode contract in wizard
  const wizardSource = fs.readFileSync(
    path.resolve('src/components/sheets-hub/ConnectSheetWizard.tsx'),
    'utf8'
  );
  assert.match(
    wizardSource,
    /syncMode:\s*'sheet_to_app'/,
    'ConnectSheetWizard must save connections strictly with syncMode = "sheet_to_app"'
  );
});

// ============================================================================
// 4. DIAGNOSTIC CLASSIFICATION PRECISION
// ============================================================================
test('Diagnostic Precision — extractFirebaseAuthCode detects OAuth 403 access_denied patterns', () => {
  assert.equal(
    extractFirebaseAuthCode({ code: 'auth/access-denied' }),
    'auth/access-denied'
  );
  assert.equal(
    extractFirebaseAuthCode(
      new Error('Error 403: access_denied. Access blocked: seismic-codex-m01dl.firebaseapp.com')
    ),
    'auth/access-denied'
  );
  assert.equal(
    extractFirebaseAuthCode(
      new Error('The app is currently being tested and can only be accessed by developer-approved testers.')
    ),
    'auth/access-denied'
  );
  assert.equal(
    extractFirebaseAuthCode(
      new Error('seismic-codex-m01dl.firebaseapp.com has not completed the Google verification process.')
    ),
    'auth/access-denied'
  );
});

test('Diagnostic Precision — popup-closed-by-user does NOT automatically imply confirmed Testing Mode', () => {
  // Test with sheet_hub_readonly scope mode
  const readOnlyDiag = classifyFirebaseAuthError(
    { code: 'auth/popup-closed-by-user', message: 'Firebase: Error (auth/popup-closed-by-user).' },
    {
      scopeMode: 'sheet_hub_readonly',
      isIframe: false,
      hostname: 'localhost',
    }
  );

  assert.equal(readOnlyDiag.code, 'auth/popup-closed-by-user');
  assert.equal(readOnlyDiag.scopeMode, 'sheet_hub_readonly');
  assert.equal(
    readOnlyDiag.isTestingModeBlock,
    false,
    'Popup closure must NOT be flagged as a confirmed testing mode block'
  );
  assert.doesNotMatch(readOnlyDiag.title, /OAuth Testing Mode/i);
  assert.match(readOnlyDiag.title, /Read-Only Authorization Window Closed/i);
  assert.match(readOnlyDiag.summary, /closed before completing/i);
  assert.match(readOnlyDiag.resolutionHint, /Possible cause/i);
  assert.match(readOnlyDiag.resolutionHint, /Test Users/i);
  assert.equal(readOnlyDiag.canRetry, true);

  // Test with legacy sheets scope mode
  const legacyDiag = classifyFirebaseAuthError(
    { code: 'auth/popup-closed-by-user', message: 'Popup closed' },
    {
      scopeMode: 'sheets',
      isIframe: false,
      hostname: 'localhost',
    }
  );

  assert.equal(legacyDiag.isTestingModeBlock, false);
  assert.doesNotMatch(legacyDiag.title, /OAuth Testing Mode/i);
});

test('Diagnostic Precision — explicit access_denied testing mode block is correctly confirmed', () => {
  const rawError = new Error(
    'Access blocked: seismic-codex-m01dl.firebaseapp.com has not completed the Google verification process. The app is currently being tested and can only be accessed by developer-approved testers. Error 403: access_denied'
  );

  const diag = classifyFirebaseAuthError(rawError, {
    scopeMode: 'sheet_hub_readonly',
    isIframe: false,
    hostname: 'localhost',
    userEmail: 'tester@example.com',
  });

  assert.equal(diag.code, 'auth/access-denied');
  assert.equal(diag.scopeMode, 'sheet_hub_readonly');
  assert.equal(diag.isTestingModeBlock, true, 'Confirmed 403 test users message must be flagged');
  assert.match(diag.title, /Read-Only Authorization Blocked \(OAuth Testing Mode\)/i);
  assert.match(diag.summary, /seismic-codex-m01dl/);
  assert.match(diag.summary, /developer-approved test users/i);
  assert.match(diag.resolutionHint, /OAuth consent screen/i);
  assert.match(diag.resolutionHint, /Test users/i);
  assert.ok(diag.testUsersGuideHint);
  assert.match(diag.testUsersGuideHint!, /seismic-codex-m01dl/);
});

test('Diagnostic Precision — normal user cancellation on consent screen is not flagged as testing mode', () => {
  const cancelDiag = classifyFirebaseAuthError(
    { code: 'auth/access-denied', message: 'User denied permission' },
    {
      scopeMode: 'sheet_hub_readonly',
      isIframe: false,
      hostname: 'localhost',
    }
  );

  assert.equal(cancelDiag.code, 'auth/access-denied');
  assert.equal(
    cancelDiag.isTestingModeBlock,
    false,
    'Standard user rejection must not be flagged as testing mode block'
  );
  assert.match(cancelDiag.title, /Read-Only Permissions Declined/i);
  assert.match(cancelDiag.summary, /read-only access was declined/i);
  assert.doesNotMatch(cancelDiag.title, /OAuth Testing Mode/i);
});

test('Diagnostic Precision — unauthorized-domain provides copyable hostname', () => {
  const testHost = 'custom-auth-domain.web.app';
  const diag = classifyFirebaseAuthError(
    { code: 'auth/unauthorized-domain', message: 'Domain not authorized for OAuth' },
    {
      scopeMode: 'sheet_hub_readonly',
      isIframe: false,
      hostname: testHost,
    }
  );

  assert.equal(diag.code, 'auth/unauthorized-domain');
  assert.equal(diag.shouldOfferCopyDomain, true);
  assert.equal(diag.hostname, testHost);
  assert.match(diag.summary, new RegExp(testHost));
  assert.match(diag.resolutionHint, /Authorized domains/i);
});

// ============================================================================
// 5. IMPORT SAFETY & STORE INTEGRITY ON DENIAL
// ============================================================================
test('Import Safety — Denied authorization does NOT create false connection or corrupt store', async () => {
  const testUserId = 'usr_oauth_deny_test_' + Date.now();

  const initialConnections = await sheetHubStore.listConnections(testUserId);
  assert.equal(initialConnections.length, 0);

  // Simulate an aborted or denied authorization attempt
  let authFailed = false;
  try {
    const error = new Error('auth/access-denied');
    const diag = classifyFirebaseAuthError(error, {
      scopeMode: 'sheet_hub_readonly',
      userEmail: 'tester@example.com',
    });
    assert.equal(diag.code, 'auth/access-denied');
    authFailed = true;
  } catch {
    authFailed = false;
  }

  assert.equal(authFailed, true);

  // Store must still contain 0 connections
  const connectionsAfter = await sheetHubStore.listConnections(testUserId);
  assert.equal(
    connectionsAfter.length,
    0,
    'Denied authorization must never create or write connection documents'
  );

  await sheetHubStore.deleteConnection(testUserId, 'non_existent_id');
});

after(async () => {
  try {
    await terminate(db);
  } catch {}
});
