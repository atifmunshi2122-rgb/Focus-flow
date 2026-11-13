import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyFirebaseAuthError,
  createSingleFlightRunner,
  extractFirebaseAuthCode,
} from '../src/lib/authDiagnostics.ts';

test('Auth Diagnostics — extractFirebaseAuthCode extracts code property or message pattern', () => {
  assert.equal(extractFirebaseAuthCode({ code: 'auth/popup-blocked' }), 'auth/popup-blocked');
  assert.equal(
    extractFirebaseAuthCode(new Error('Firebase: Error (auth/unauthorized-domain).')),
    'auth/unauthorized-domain'
  );
  assert.equal(extractFirebaseAuthCode(new Error('OAuth access_denied')), 'auth/access-denied');
  assert.equal(extractFirebaseAuthCode(new Error('Something unexpected')), 'auth/unknown');
});

test('Auth Diagnostics — classifies popup-closed-by-user differently inside embedded iframe vs direct tab', () => {
  const iframeDiag = classifyFirebaseAuthError(
    { code: 'auth/popup-closed-by-user', message: 'Popup closed' },
    { scopeMode: 'basic', isIframe: true, hostname: 'ais-pre-example.asia-east1.run.app' }
  );

  assert.equal(iframeDiag.code, 'auth/popup-closed-by-user');
  assert.equal(iframeDiag.isIframe, true);
  assert.equal(iframeDiag.shouldOfferNewTab, true);
  assert.match(iframeDiag.title, /Embedded Preview/i);
  assert.match(iframeDiag.resolutionHint, /Open App in New Tab/i);

  const directDiag = classifyFirebaseAuthError(
    { code: 'auth/popup-closed-by-user', message: 'Popup closed' },
    { scopeMode: 'basic', isIframe: false, hostname: 'ais-dev-example.asia-east1.run.app' }
  );
  assert.equal(directDiag.isIframe, false);
  assert.equal(directDiag.shouldOfferNewTab, true);
  assert.doesNotMatch(directDiag.title, /Embedded Preview/i);
});

test('Auth Diagnostics — classifies unauthorized-domain with copyable hostname guidance', () => {
  const diag = classifyFirebaseAuthError(
    { code: 'auth/unauthorized-domain', message: 'Domain not authorized' },
    {
      scopeMode: 'basic',
      isIframe: false,
      hostname: 'ais-pre-276nqhz6z5gawkw7wlakr7-402945852829.asia-east1.run.app',
    }
  );

  assert.equal(diag.code, 'auth/unauthorized-domain');
  assert.equal(diag.shouldOfferCopyDomain, true);
  assert.equal(diag.shouldOfferNewTab, false);
  assert.match(diag.summary, /ais-pre-276nqhz6z5gawkw7wlakr7/);
  assert.match(diag.resolutionHint, /Authorized domains/i);
});

test('Auth Diagnostics — separates Sheets permission rejection messaging from basic login', () => {
  const sheetsDiag = classifyFirebaseAuthError(
    { code: 'auth/missing-access-token', message: 'missing_access_token' },
    { scopeMode: 'sheets', isIframe: false, hostname: 'localhost' }
  );

  assert.equal(sheetsDiag.scopeMode, 'sheets');
  assert.match(sheetsDiag.title, /Sheets Permissions Required/i);
  assert.match(sheetsDiag.summary, /basic Firebase account sign-in remains active/i);

  const mismatchDiag = classifyFirebaseAuthError(
    { code: 'auth/user-mismatch', message: 'User mismatch' },
    { scopeMode: 'sheets', isIframe: false, hostname: 'localhost', userEmail: 'user@example.com' }
  );
  assert.match(mismatchDiag.summary, /user@example\.com/);
});

test('Auth Concurrency — createSingleFlightRunner deduplicates overlapping calls and resets after completion', async () => {
  let invocations = 0;
  let releaseFirst!: (val: string) => void;

  const runner = createSingleFlightRunner(
    () =>
      new Promise<string>((resolve) => {
        invocations += 1;
        releaseFirst = resolve;
      })
  );

  const p1 = runner();
  const p2 = runner();
  assert.equal(invocations, 1, 'Overlapping calls must share a single active popup');
  assert.strictEqual(p1, p2);

  releaseFirst('ok-1');
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, 'ok-1');
  assert.equal(r2, 'ok-1');

  const p3 = runner();
  assert.equal(invocations, 2, 'New call after completion should start a fresh attempt');
  releaseFirst('ok-2');
  assert.equal(await p3, 'ok-2');
});

test('Auth Concurrency — createSingleFlightRunner clears lock cleanly after rejection so retry succeeds', async () => {
  let attempt = 0;
  const runner = createSingleFlightRunner(async () => {
    attempt += 1;
    if (attempt === 1) {
      throw new Error('auth/popup-blocked');
    }
    return 'recovered';
  });

  await assert.rejects(() => runner(), /popup-blocked/);
  const result = await runner();
  assert.equal(result, 'recovered');
  assert.equal(attempt, 2);
});

test('Auth Architecture — basic Google Sign-In is decoupled from Sheets scopes and generic failure message is removed', () => {
  const firebaseSource = fs.readFileSync(path.resolve('src/lib/firebase.ts'), 'utf8');
  const appContextSource = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');
  const modalSource = fs.readFileSync(
    path.resolve('src/components/common/AuthRecoveryModal.tsx'),
    'utf8'
  );

  // Basic provider must be constructed without addScope calls for spreadsheets/drive
  const basicProviderMatch = firebaseSource.match(
    /export const basicGoogleProvider[\s\S]*?export function createSheetsGoogleProvider/
  );
  assert.ok(basicProviderMatch, 'Expected basicGoogleProvider before createSheetsGoogleProvider');
  assert.doesNotMatch(basicProviderMatch[0], /spreadsheets|drive\.file/);

  // Sheets provider must explicitly include spreadsheets + drive.file scopes
  assert.match(firebaseSource, /https:\/\/www\.googleapis\.com\/auth\/spreadsheets/);
  assert.match(firebaseSource, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(firebaseSource, /export const authorizeGoogleSheets = createSingleFlightRunner/);

  // Generic opaque toast must be replaced with structured classification
  assert.doesNotMatch(appContextSource, /Google Sign-In was cancelled or failed/);
  assert.match(appContextSource, /classifyFirebaseAuthError/);

  // Recovery modal uses declarative anchor breakout without window.open / window.alert
  assert.match(modalSource, /target="_blank"/);
  assert.doesNotMatch(modalSource, /window\.open\(|window\.alert\(/);
});

test('Server Security Headers — allows embedded preview iframe and cross-origin auth popups', async () => {
  const { securityHeaders, corsHandler } = await import('../server/security.ts');
  const setHeaders: Record<string, string> = {};
  let nextCalled = false;

  const mockReq = {
    method: 'GET',
    headers: {
      host: 'ais-pre-276nqhz6z5gawkw7wlakr7-402945852829.asia-east1.run.app',
      origin: 'https://ais-pre-276nqhz6z5gawkw7wlakr7-402945852829.asia-east1.run.app',
    },
  } as unknown as import('express').Request;

  const mockRes = {
    setHeader(name: string, value: string) {
      setHeaders[name.toLowerCase()] = value;
    },
  } as unknown as import('express').Response;

  securityHeaders(mockReq, mockRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(setHeaders['cross-origin-opener-policy'], 'same-origin-allow-popups');
  assert.equal(setHeaders['x-frame-options'], undefined);
  assert.equal(setHeaders['x-content-type-options'], 'nosniff');

  const corsHeaders: Record<string, string> = {};
  let corsNext = false;
  corsHandler(
    mockReq,
    {
      setHeader(name: string, value: string) {
        corsHeaders[name.toLowerCase()] = value;
      },
    } as unknown as import('express').Response,
    () => {
      corsNext = true;
    }
  );
  assert.equal(corsNext, true);
  assert.equal(
    corsHeaders['access-control-allow-origin'],
    'https://ais-pre-276nqhz6z5gawkw7wlakr7-402945852829.asia-east1.run.app'
  );
  assert.match(corsHeaders['access-control-allow-headers'], /x-google-access-token/i);
});

test('Sheets OAuth Recovery — backend routes emit SHEETS_AUTH_REQUIRED and client clears only Sheets token', () => {
  const routesSource = fs.readFileSync(path.resolve('server/routes.ts'), 'utf8');
  const apiSource = fs.readFileSync(path.resolve('src/lib/api.ts'), 'utf8');
  const sheetsServiceSource = fs.readFileSync(path.resolve('src/lib/googleSheetsService.ts'), 'utf8');
  const appContextSource = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');

  assert.match(routesSource, /function sendSheetsError/);
  assert.match(routesSource, /code:\s*'SHEETS_AUTH_REQUIRED'/);
  assert.match(apiSource, /apiErr\.code = errorCode/);
  assert.match(sheetsServiceSource, /wrapped\.code =/);
  assert.match(appContextSource, /handleSheetsSyncError/);
  assert.match(appContextSource, /fbSetAccessToken\(null\)/);
});

test('Auth Readiness — waitForInitialAuth returns live auth.currentUser and guards prevent unauthenticated Firestore reads', () => {
  const firebaseSource = fs.readFileSync(path.resolve('src/lib/firebase.ts'), 'utf8');
  const apiSource = fs.readFileSync(path.resolve('src/lib/api.ts'), 'utf8');
  const appContextSource = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');

  assert.match(firebaseSource, /authStateReady/);
  assert.match(firebaseSource, /return auth\.currentUser;/);
  assert.match(firebaseSource, /initialAuthPromise = null;/);
  assert.match(apiSource, /fbUser && auth\.currentUser\?\.uid === fbUser\.uid/);
  assert.match(apiSource, /if \(!auth\.currentUser\)/);
  assert.match(appContextSource, /auth\.currentUser\?\.uid !== fbUser\.uid/);
});


