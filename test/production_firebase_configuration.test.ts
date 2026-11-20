import './test_bootstrap.ts';
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PRODUCTION_PROJECT_ID as FRONTEND_PROD_PROJECT_ID,
  PRODUCTION_DATABASE_ID as FRONTEND_PROD_DATABASE_ID,
  resolveFirebaseConfiguration,
} from '../src/lib/firebaseConfigResolver.ts';
import {
  PRODUCTION_PROJECT_ID as BACKEND_PROD_PROJECT_ID,
  resolveServerFirebaseProjectId,
  resetCachedProjectIdForTests,
} from '../server/auth.ts';
import {
  PRODUCTION_PROJECT_ID as VAULT_PROD_PROJECT_ID,
  PRODUCTION_DATABASE_ID as VAULT_PROD_DATABASE_ID,
  resolveFirestoreDatabaseId,
} from '../server/vaultBackendService.ts';

describe('Production Firebase Configuration & AI Studio Regression Guard', () => {
  const EXPECTED_PROD_PROJECT = 'focus-flow-by-atif';
  const EXPECTED_PROD_DATABASE = '(default)';
  const FORBIDDEN_AI_STUDIO_PROJECT = 'gen-lang-client-0390447756';

  it('1. firebase-applet-config.json must point to focus-flow-by-atif and never gen-lang-client', () => {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    assert.ok(fs.existsSync(configPath), 'firebase-applet-config.json must exist');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(
      config.projectId,
      EXPECTED_PROD_PROJECT,
      `firebase-applet-config.json must have projectId '${EXPECTED_PROD_PROJECT}'`
    );
    assert.notEqual(
      config.projectId,
      FORBIDDEN_AI_STUDIO_PROJECT,
      `firebase-applet-config.json was reverted to AI Studio project '${FORBIDDEN_AI_STUDIO_PROJECT}'!`
    );
    assert.equal(config.messagingSenderId, '1010159085609');
    assert.equal(config.authDomain, `${EXPECTED_PROD_PROJECT}.firebaseapp.com`);
    assert.equal(config.firestoreDatabaseId, EXPECTED_PROD_DATABASE);
    assert.equal(config.measurementId, 'G-H4D8JLHJQJ');
  });

  it('2. .firebaserc default project must be focus-flow-by-atif', () => {
    const rcPath = path.resolve(process.cwd(), '.firebaserc');
    assert.ok(fs.existsSync(rcPath), '.firebaserc must exist');

    const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    assert.equal(
      rc.projects?.default,
      EXPECTED_PROD_PROJECT,
      `.firebaserc default must be '${EXPECTED_PROD_PROJECT}'`
    );
    assert.notEqual(
      rc.projects?.default,
      FORBIDDEN_AI_STUDIO_PROJECT,
      `.firebaserc was reverted to AI Studio project '${FORBIDDEN_AI_STUDIO_PROJECT}'!`
    );
  });

  it('3. Frontend, Backend Auth, and Joint Vaults agree on PRODUCTION_PROJECT_ID', () => {
    assert.equal(
      FRONTEND_PROD_PROJECT_ID,
      EXPECTED_PROD_PROJECT,
      'Frontend resolver must have focus-flow-by-atif as production project'
    );
    assert.equal(
      BACKEND_PROD_PROJECT_ID,
      EXPECTED_PROD_PROJECT,
      'server/auth.ts must have focus-flow-by-atif as production project'
    );
    assert.equal(
      VAULT_PROD_PROJECT_ID,
      EXPECTED_PROD_PROJECT,
      'server/vaultBackendService.ts must have focus-flow-by-atif as production project'
    );
  });

  it('4. Frontend and Joint Vaults agree on PRODUCTION_DATABASE_ID', () => {
    assert.equal(FRONTEND_PROD_DATABASE_ID, EXPECTED_PROD_DATABASE);
    assert.equal(VAULT_PROD_DATABASE_ID, EXPECTED_PROD_DATABASE);
  });

  it('5. Runtime Production Resolution: Frontend and Backend both resolve focus-flow-by-atif', () => {
    // Frontend resolution under Vercel Production
    const frontendProd = resolveFirebaseConfiguration({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      NODE_ENV: 'production',
    });
    assert.equal(frontendProd.error, null);
    assert.equal(frontendProd.config?.projectId, EXPECTED_PROD_PROJECT);
    assert.equal(frontendProd.config?.firestoreDatabaseId, EXPECTED_PROD_DATABASE);

    // Backend resolution under Vercel Production
    const origVercel = process.env.VERCEL;
    const origVercelEnv = process.env.VERCEL_ENV;
    const origBackend = process.env.FIREBASE_PROJECT_ID;
    const origFrontend = process.env.VITE_FIREBASE_PROJECT_ID;
    try {
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'production';
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.VITE_FIREBASE_PROJECT_ID;
      resetCachedProjectIdForTests();

      assert.equal(resolveServerFirebaseProjectId(), EXPECTED_PROD_PROJECT);
    } finally {
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
      else delete process.env.VERCEL;
      if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
      else delete process.env.VERCEL_ENV;
      if (origBackend !== undefined) process.env.FIREBASE_PROJECT_ID = origBackend;
      else delete process.env.FIREBASE_PROJECT_ID;
      if (origFrontend !== undefined) process.env.VITE_FIREBASE_PROJECT_ID = origFrontend;
      else delete process.env.VITE_FIREBASE_PROJECT_ID;
      resetCachedProjectIdForTests();
    }
  });

  it('6. Preview Safety Gate: Frontend and Backend strictly reject both focus-flow-by-atif and gen-lang-client', () => {
    // Frontend rejects focus-flow-by-atif in Preview
    const previewSeismic = resolveFirebaseConfiguration({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VITE_FIREBASE_PROJECT_ID: EXPECTED_PROD_PROJECT,
      VITE_FIREBASE_API_KEY: 'AIzaSyFakeKey',
      VITE_FIREBASE_AUTH_DOMAIN: `${EXPECTED_PROD_PROJECT}.firebaseapp.com`,
      VITE_FIREBASE_DATABASE_ID: 'staging-db',
    });
    assert.ok(previewSeismic.error);
    assert.match(previewSeismic.error.message, /STAGING_DATA_SAFETY_VIOLATION/);

    // Frontend rejects gen-lang-client in Preview
    const previewGenLang = resolveFirebaseConfiguration({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VITE_FIREBASE_PROJECT_ID: FORBIDDEN_AI_STUDIO_PROJECT,
      VITE_FIREBASE_API_KEY: 'AIzaSyFakeKey',
      VITE_FIREBASE_AUTH_DOMAIN: `${FORBIDDEN_AI_STUDIO_PROJECT}.firebaseapp.com`,
      VITE_FIREBASE_DATABASE_ID: 'staging-db',
    });
    assert.ok(previewGenLang.error);
    assert.match(previewGenLang.error.message, /STAGING_DATA_SAFETY_VIOLATION/);

    // Backend rejects focus-flow-by-atif in Preview
    const origVercel = process.env.VERCEL;
    const origVercelEnv = process.env.VERCEL_ENV;
    const origBackend = process.env.FIREBASE_PROJECT_ID;
    try {
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'preview';

      process.env.FIREBASE_PROJECT_ID = EXPECTED_PROD_PROJECT;
      resetCachedProjectIdForTests();
      assert.throws(() => resolveServerFirebaseProjectId(), /STAGING_DATA_SAFETY_VIOLATION/);

      process.env.FIREBASE_PROJECT_ID = FORBIDDEN_AI_STUDIO_PROJECT;
      resetCachedProjectIdForTests();
      assert.throws(() => resolveServerFirebaseProjectId(), /STAGING_DATA_SAFETY_VIOLATION/);
    } finally {
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
      else delete process.env.VERCEL;
      if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
      else delete process.env.VERCEL_ENV;
      if (origBackend !== undefined) process.env.FIREBASE_PROJECT_ID = origBackend;
      else delete process.env.FIREBASE_PROJECT_ID;
      resetCachedProjectIdForTests();
    }
  });

  it('7. firebase.json authorizedRedirectUris points to focus-flow-by-atif', () => {
    const fbJsonPath = path.resolve(process.cwd(), 'firebase.json');
    assert.ok(fs.existsSync(fbJsonPath), 'firebase.json must exist');

    const fbJson = JSON.parse(fs.readFileSync(fbJsonPath, 'utf8'));
    const uris = fbJson.auth?.providers?.googleSignIn?.authorizedRedirectUris || [];
    assert.ok(
      uris.some((u: string) => u.includes('focus-flow-by-atif.firebaseapp.com')),
      'firebase.json must contain focus-flow-by-atif.firebaseapp.com in authorizedRedirectUris'
    );
  });
});
