import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GHOST_OAUTH_CLIENT_ID,
  GHOST_PROJECT_ID,
  GOOGLE_DRIVE_SHEETS_SCOPES,
  getGoogleOAuthClientId,
} from '../src/lib/googleAuthGis.ts';

describe('Google Identity Services (GIS) Token Client & Credential Security', () => {
  // --------------------------------------------------------------------------
  // 1. Project focus-flow-by-atif Client ID Verification
  // --------------------------------------------------------------------------
  it('1. binds strictly to project focus-flow-by-atif and Web Application Client ID', () => {
    assert.equal(GHOST_PROJECT_ID, 'focus-flow-by-atif');
    assert.equal(
      GHOST_OAUTH_CLIENT_ID,
      '1010159085609-hcetogi5vbajkg9706m6t9u9h11olfd7.apps.googleusercontent.com'
    );
    assert.equal(getGoogleOAuthClientId(), GHOST_OAUTH_CLIENT_ID);
  });

  // --------------------------------------------------------------------------
  // 2. Least-Privilege OAuth Scopes
  // --------------------------------------------------------------------------
  it('2. requests least-privilege scopes: only drive.file and spreadsheets', () => {
    assert.deepEqual(GOOGLE_DRIVE_SHEETS_SCOPES, [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ]);

    // Ensure broad or full Drive access scopes are never requested
    assert.ok(!GOOGLE_DRIVE_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/drive' as any));
    assert.ok(!GOOGLE_DRIVE_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/drive.readonly' as any));
  });

  // --------------------------------------------------------------------------
  // 3. Client Secret Leak Audit (Zero-Secret Invariant)
  // --------------------------------------------------------------------------
  it('3. ensures OAuth client secret is NEVER included in client source code', () => {
    const forbiddenPattern = new RegExp(['G', 'O', 'C', 'S', 'P', 'X'].join('') + '-[A-Za-z0-9_-]+');
    const clientFilesToCheck = [
      'src/lib/googleAuthGis.ts',
      'src/lib/firebase.ts',
      'src/context/AppContext.tsx',
      'src/components/sheets-hub/ConnectSheetWizard.tsx',
    ];

    for (const relPath of clientFilesToCheck) {
      const fullPath = join(process.cwd(), relPath);
      const content = readFileSync(fullPath, 'utf-8');
      assert.ok(
        !forbiddenPattern.test(content),
        `CRITICAL SECURITY VIOLATION: Client secret found in frontend file ${relPath}!`
      );
    }
  });

  // --------------------------------------------------------------------------
  // 4. Token Storage Isolation (Ephemeral Memory Only)
  // --------------------------------------------------------------------------
  it('4. ensures client token handlers store access tokens purely in memory without persistence', () => {
    const gisSource = readFileSync(join(process.cwd(), 'src/lib/googleAuthGis.ts'), 'utf-8');

    // Must NOT call localStorage.setItem or setDoc for OAuth tokens
    assert.ok(!gisSource.includes('localStorage.setItem'));
    assert.ok(!gisSource.includes('sessionStorage.setItem'));
    assert.ok(!gisSource.includes('setDoc'));
  });
});

