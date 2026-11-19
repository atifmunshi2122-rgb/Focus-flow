import './test_bootstrap.ts';
import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFirebaseConfiguration,
  detectDeploymentTier,
  PRODUCTION_PROJECT_ID,
  PRODUCTION_DATABASE_ID,
} from '../src/lib/firebaseConfigResolver.ts';
import {
  resolveServerFirebaseProjectId,
  resetCachedProjectIdForTests,
} from '../server/auth.ts';
import {
  resolveFirestoreDatabaseId,
  resolveProjectId as resolveVaultProjectId,
} from '../server/vaultBackendService.ts';

describe('Safe Staging Architecture & Environment Isolation Suite', () => {
  it('1. Production configuration resolves only to Production', () => {
    const result = resolveFirebaseConfiguration({}, 'production');
    assert.equal(result.error, null);
    assert.ok(result.config);
    assert.equal(result.config.projectId, PRODUCTION_PROJECT_ID);
    assert.equal(result.config.firestoreDatabaseId, PRODUCTION_DATABASE_ID);
    assert.equal(result.config.tier, 'production');
    assert.equal(result.config.isStagingIsolated, false);
  });

  it('2. Preview configuration resolves only to Staging when explicit staging vars provided', () => {
    const stagingEnv = {
      VITE_FIREBASE_PROJECT_ID: 'focusflow-staging-proj',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingTestKey123',
      VITE_FIREBASE_AUTH_DOMAIN: 'focusflow-staging-proj.firebaseapp.com',
      VITE_FIREBASE_DATABASE_ID: 'staging-focusflowfinance-db',
    };

    const result = resolveFirebaseConfiguration(stagingEnv, 'preview');
    assert.equal(result.error, null);
    assert.ok(result.config);
    assert.equal(result.config.projectId, 'focusflow-staging-proj');
    assert.equal(result.config.firestoreDatabaseId, 'staging-focusflowfinance-db');
    assert.equal(result.config.tier, 'preview');
    assert.equal(result.config.isStagingIsolated, true);
  });

  it('3. Missing Preview variables cause a fail-closed configuration error', () => {
    const result = resolveFirebaseConfiguration({}, 'preview');
    assert.equal(result.config, null);
    assert.ok(result.error);
    assert.match(result.error.message, /PREVIEW_STAGING_CONFIG_MISSING/);
    assert.match(result.error.message, /VITE_FIREBASE_PROJECT_ID/);
  });

  it('4. Preview never falls back to Production manifest or accepts production identifiers', () => {
    // Attempt to pass production project ID into Preview
    const copyPasteProductionEnv = {
      VITE_FIREBASE_PROJECT_ID: PRODUCTION_PROJECT_ID,
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingTestKey123',
      VITE_FIREBASE_AUTH_DOMAIN: 'focusflow-staging.firebaseapp.com',
      VITE_FIREBASE_DATABASE_ID: 'staging-database',
    };

    const resultProject = resolveFirebaseConfiguration(copyPasteProductionEnv, 'preview');
    assert.equal(resultProject.config, null);
    assert.ok(resultProject.error);
    assert.match(resultProject.error.message, /STAGING_DATA_SAFETY_VIOLATION/);

    // Attempt to pass production database ID into Preview
    const copyPasteDbEnv = {
      VITE_FIREBASE_PROJECT_ID: 'focusflow-staging',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingTestKey123',
      VITE_FIREBASE_AUTH_DOMAIN: 'focusflow-staging.firebaseapp.com',
      VITE_FIREBASE_DATABASE_ID: PRODUCTION_DATABASE_ID,
    };

    const resultDb = resolveFirebaseConfiguration(copyPasteDbEnv, 'preview');
    assert.equal(resultDb.config, null);
    assert.ok(resultDb.error);
    assert.match(resultDb.error.message, /STAGING_DATA_SAFETY_VIOLATION/);
  });

  it('5. Backend and frontend project IDs cannot silently disagree', () => {
    const origBackend = process.env.FIREBASE_PROJECT_ID;
    const origFrontend = process.env.VITE_FIREBASE_PROJECT_ID;
    const origVercel = process.env.VERCEL_ENV;

    try {
      delete process.env.VERCEL_ENV;
      process.env.FIREBASE_PROJECT_ID = 'staging-project-alpha';
      process.env.VITE_FIREBASE_PROJECT_ID = 'staging-project-beta';
      resetCachedProjectIdForTests();

      assert.throws(() => {
        resolveServerFirebaseProjectId();
      }, /CONFIG_DISAGREEMENT/);
    } finally {
      if (origBackend !== undefined) process.env.FIREBASE_PROJECT_ID = origBackend;
      else delete process.env.FIREBASE_PROJECT_ID;
      if (origFrontend !== undefined) process.env.VITE_FIREBASE_PROJECT_ID = origFrontend;
      else delete process.env.VITE_FIREBASE_PROJECT_ID;
      if (origVercel !== undefined) process.env.VERCEL_ENV = origVercel;
      else delete process.env.VERCEL_ENV;
      resetCachedProjectIdForTests();
    }
  });

  it('6. Named Firestore database configuration is respected across frontend and backend', () => {
    const origDb = process.env.VITE_FIREBASE_DATABASE_ID;
    const origVercel = process.env.VERCEL_ENV;

    try {
      process.env.VERCEL_ENV = 'preview';
      process.env.VITE_FIREBASE_DATABASE_ID = 'staging-isolated-named-db';

      // Backend resolver
      const backendDb = resolveFirestoreDatabaseId();
      assert.equal(backendDb, 'staging-isolated-named-db');

      // Frontend resolver
      const frontendRes = resolveFirebaseConfiguration(
        {
          VITE_FIREBASE_PROJECT_ID: 'staging-proj',
          VITE_FIREBASE_API_KEY: 'staging-key',
          VITE_FIREBASE_AUTH_DOMAIN: 'staging-proj.firebaseapp.com',
          VITE_FIREBASE_DATABASE_ID: 'staging-isolated-named-db',
        },
        'preview'
      );
      assert.equal(frontendRes.config?.firestoreDatabaseId, 'staging-isolated-named-db');
    } finally {
      if (origDb !== undefined) process.env.VITE_FIREBASE_DATABASE_ID = origDb;
      else delete process.env.VITE_FIREBASE_DATABASE_ID;
      if (origVercel !== undefined) process.env.VERCEL_ENV = origVercel;
      else delete process.env.VERCEL_ENV;
    }
  });

  it('7. Preview backend fails closed if preview vars are missing or pointing to production', () => {
    const origBackend = process.env.FIREBASE_PROJECT_ID;
    const origFrontend = process.env.VITE_FIREBASE_PROJECT_ID;
    const origVercel = process.env.VERCEL_ENV;

    try {
      process.env.VERCEL_ENV = 'preview';
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.VITE_FIREBASE_PROJECT_ID;
      resetCachedProjectIdForTests();

      assert.throws(() => {
        resolveServerFirebaseProjectId();
      }, /PREVIEW_STAGING_CONFIG_MISSING/);

      // Attempt to point preview backend to production
      process.env.FIREBASE_PROJECT_ID = PRODUCTION_PROJECT_ID;
      assert.throws(() => {
        resolveServerFirebaseProjectId();
      }, /STAGING_DATA_SAFETY_VIOLATION/);
    } finally {
      if (origBackend !== undefined) process.env.FIREBASE_PROJECT_ID = origBackend;
      else delete process.env.FIREBASE_PROJECT_ID;
      if (origFrontend !== undefined) process.env.VITE_FIREBASE_PROJECT_ID = origFrontend;
      else delete process.env.VITE_FIREBASE_PROJECT_ID;
      if (origVercel !== undefined) process.env.VERCEL_ENV = origVercel;
      else delete process.env.VERCEL_ENV;
      resetCachedProjectIdForTests();
    }
  });

  it('8. Existing Production configuration remains unchanged and intact', () => {
    const prodRes = resolveFirebaseConfiguration({}, 'production');
    assert.equal(prodRes.error, null);
    assert.equal(prodRes.config?.projectId, PRODUCTION_PROJECT_ID);
    assert.equal(prodRes.config?.firestoreDatabaseId, PRODUCTION_DATABASE_ID);
    assert.equal(prodRes.config?.authDomain, `${PRODUCTION_PROJECT_ID}.firebaseapp.com`);
  });

  it('9. Hostname detection correctly categorizes preview versus production domains', () => {
    assert.equal(
      detectDeploymentTier({ hostname: 'focus-flow-by-atif.vercel.app' }),
      'production'
    );
    assert.equal(
      detectDeploymentTier({ hostname: 'focus-flow-git-review-pre-push.vercel.app' }),
      'preview'
    );
    assert.equal(
      detectDeploymentTier({ hostname: 'localhost' }),
      'development'
    );
    assert.equal(
      detectDeploymentTier({ hostname: '127.0.0.1' }),
      'development'
    );
  });
});
