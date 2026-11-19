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

describe('Vercel Environment Precedence & Safe Staging Isolation Matrix', () => {
  // ==========================================================================
  // Test A: VERCEL_ENV=preview, PROD=true, Staging project and database configured
  // Expected: Preview/Staging.
  // ==========================================================================
  it('Test A — VERCEL_ENV=preview, PROD=true with staging variables resolves to Staging', () => {
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      PROD: 'true',
      NODE_ENV: 'production',
      VITE_FIREBASE_PROJECT_ID: 'focusflow-staging-proj',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingKey123',
      VITE_FIREBASE_AUTH_DOMAIN: 'focusflow-staging-proj.firebaseapp.com',
      VITE_FIREBASE_DATABASE_ID: 'staging-focusflow-db',
    };

    const result = resolveFirebaseConfiguration(env);
    assert.equal(result.error, null);
    assert.ok(result.config);
    assert.equal(result.config.tier, 'preview');
    assert.equal(result.config.projectId, 'focusflow-staging-proj');
    assert.equal(result.config.firestoreDatabaseId, 'staging-focusflow-db');
    assert.equal(result.config.isStagingIsolated, true);
  });

  // ==========================================================================
  // Test B: VERCEL_ENV=preview, PROD=true, No Staging variables
  // Expected: Configuration blocked. No Production fallback.
  // ==========================================================================
  it('Test B — VERCEL_ENV=preview, PROD=true with missing staging vars fails closed with no Production fallback', () => {
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      PROD: 'true',
      NODE_ENV: 'production',
    };

    const result = resolveFirebaseConfiguration(env);
    assert.equal(result.config, null);
    assert.ok(result.error);
    assert.match(result.error.message, /PREVIEW_STAGING_CONFIG_MISSING/);
    assert.match(result.error.message, /VITE_FIREBASE_PROJECT_ID/);
  });

  // ==========================================================================
  // Test C: VERCEL_ENV=preview, PROD=true, Production project ID supplied accidentally
  // Expected: STAGING_DATA_SAFETY_VIOLATION.
  // ==========================================================================
  it('Test C — VERCEL_ENV=preview, PROD=true with production project ID throws STAGING_DATA_SAFETY_VIOLATION', () => {
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      PROD: 'true',
      NODE_ENV: 'production',
      VITE_FIREBASE_PROJECT_ID: PRODUCTION_PROJECT_ID,
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingKey123',
      VITE_FIREBASE_AUTH_DOMAIN: 'focusflow-staging.firebaseapp.com',
      VITE_FIREBASE_DATABASE_ID: 'staging-db',
    };

    const result = resolveFirebaseConfiguration(env);
    assert.equal(result.config, null);
    assert.ok(result.error);
    assert.match(result.error.message, /STAGING_DATA_SAFETY_VIOLATION/);
  });

  // ==========================================================================
  // Test D: VERCEL_ENV=preview, VITE_APP_ENV=production, PROD=true
  // Expected: Preview environment must not become Production. Report conflicting configuration clearly.
  // ==========================================================================
  it('Test D — VERCEL_ENV=preview conflicts with VITE_APP_ENV=production and reports conflict clearly', () => {
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VITE_APP_ENV: 'production',
      PROD: 'true',
      NODE_ENV: 'production',
      VITE_FIREBASE_PROJECT_ID: 'focusflow-staging',
      VITE_FIREBASE_API_KEY: 'AIzaSyStagingKey',
      VITE_FIREBASE_AUTH_DOMAIN: 'focusflow-staging.firebaseapp.com',
      VITE_FIREBASE_DATABASE_ID: 'staging-db',
    };

    const result = resolveFirebaseConfiguration(env);
    assert.equal(result.config, null);
    assert.ok(result.error);
    assert.match(result.error.message, /CONFIG_CONFLICT/);
  });

  // ==========================================================================
  // Test E: VERCEL_ENV=production, PROD=true, Valid Production configuration
  // Expected: Production.
  // ==========================================================================
  it('Test E — VERCEL_ENV=production, PROD=true resolves to Production', () => {
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'production',
      PROD: 'true',
      NODE_ENV: 'production',
    };

    const result = resolveFirebaseConfiguration(env);
    assert.equal(result.error, null);
    assert.ok(result.config);
    assert.equal(result.config.tier, 'production');
    assert.equal(result.config.projectId, PRODUCTION_PROJECT_ID);
    assert.equal(result.config.firestoreDatabaseId, PRODUCTION_DATABASE_ID);
  });

  // ==========================================================================
  // Test F: Vercel deployment with missing or invalid VERCEL_ENV
  // Expected: Fail closed.
  // ==========================================================================
  it('Test F — Vercel deployment with missing or invalid VERCEL_ENV fails closed', () => {
    // Missing VERCEL_ENV
    const missingEnv = {
      VERCEL: '1',
      VERCEL_ENV: '',
      PROD: 'true',
      NODE_ENV: 'production',
    };
    const resultMissing = resolveFirebaseConfiguration(missingEnv);
    assert.equal(resultMissing.config, null);
    assert.ok(resultMissing.error);
    assert.match(resultMissing.error.message, /VERCEL_ENVIRONMENT_UNRECOGNIZED/);

    // Invalid VERCEL_ENV
    const invalidEnv = {
      VERCEL: '1',
      VERCEL_ENV: 'unknown_staging_mode',
      PROD: 'true',
      NODE_ENV: 'production',
    };
    const resultInvalid = resolveFirebaseConfiguration(invalidEnv);
    assert.equal(resultInvalid.config, null);
    assert.ok(resultInvalid.error);
    assert.match(resultInvalid.error.message, /VERCEL_ENVIRONMENT_UNRECOGNIZED/);
  });

  // ==========================================================================
  // Test G: Non-Vercel local development with explicitly configured local Firebase settings
  // Expected: Local development configuration. No silent Production fallback.
  // ==========================================================================
  it('Test G — Non-Vercel local development with explicit settings resolves local config without production fallback', () => {
    const localExplicitEnv = {
      VERCEL: '',
      VERCEL_ENV: '',
      VITE_FIREBASE_PROJECT_ID: 'seismic-codex-m01dl',
      VITE_FIREBASE_DATABASE_ID: 'local-dev-db',
      NODE_ENV: 'development',
    };

    const result = resolveFirebaseConfiguration(localExplicitEnv);
    assert.equal(result.error, null);
    assert.ok(result.config);
    assert.equal(result.config.tier, 'development');
    assert.equal(result.config.projectId, 'seismic-codex-m01dl');
    assert.equal(result.config.firestoreDatabaseId, 'local-dev-db');
    assert.equal(result.config.isStagingIsolated, false);

    // When local development configures a separate non-production project:
    const localIsolatedEnv = {
      VERCEL: '',
      VERCEL_ENV: '',
      VITE_FIREBASE_PROJECT_ID: 'focusflow-isolated-dev',
      VITE_FIREBASE_DATABASE_ID: 'local-dev-db',
      NODE_ENV: 'development',
    };
    const resultIsolated = resolveFirebaseConfiguration(localIsolatedEnv);
    assert.equal(resultIsolated.config?.isStagingIsolated, true);

    // If local development has NO explicit settings, it fails closed to prevent silent production fallback
    const localEmptyEnv = {
      VERCEL: '',
      VERCEL_ENV: '',
      VITE_FIREBASE_PROJECT_ID: '',
      NODE_ENV: 'development',
    };
    const resultEmpty = resolveFirebaseConfiguration(localEmptyEnv);
    assert.equal(resultEmpty.config, null);
    assert.ok(resultEmpty.error);
    assert.match(resultEmpty.error.message, /LOCAL_CONFIG_REQUIRED/);
  });

  // ==========================================================================
  // Backend Serverless Functions Parity Tests
  // ==========================================================================
  it('Backend — resolveServerFirebaseProjectId mirrors Vercel environment rules', () => {
    const origVercel = process.env.VERCEL;
    const origVercelEnv = process.env.VERCEL_ENV;
    const origBackend = process.env.FIREBASE_PROJECT_ID;
    const origFrontend = process.env.VITE_FIREBASE_PROJECT_ID;
    const origAppEnv = process.env.APP_ENV;

    try {
      // 1. Preview on Vercel without vars -> fails closed
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'preview';
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.VITE_FIREBASE_PROJECT_ID;
      resetCachedProjectIdForTests();

      assert.throws(() => {
        resolveServerFirebaseProjectId();
      }, /PREVIEW_STAGING_CONFIG_MISSING/);

      // 2. Preview on Vercel with production project ID -> throws safety violation
      process.env.FIREBASE_PROJECT_ID = PRODUCTION_PROJECT_ID;
      resetCachedProjectIdForTests();
      assert.throws(() => {
        resolveServerFirebaseProjectId();
      }, /STAGING_DATA_SAFETY_VIOLATION/);

      // 3. Preview on Vercel with valid staging project -> resolves cleanly
      process.env.FIREBASE_PROJECT_ID = 'focusflow-staging';
      resetCachedProjectIdForTests();
      assert.equal(resolveServerFirebaseProjectId(), 'focusflow-staging');

      // 4. Vercel deployment with unrecognized environment -> fails closed
      process.env.VERCEL_ENV = 'unknown_tier';
      resetCachedProjectIdForTests();
      assert.throws(() => {
        resolveServerFirebaseProjectId();
      }, /VERCEL_ENVIRONMENT_UNRECOGNIZED/);

      // 5. Backend and frontend ID disagreement -> throws
      process.env.VERCEL_ENV = 'preview';
      process.env.FIREBASE_PROJECT_ID = 'staging-a';
      process.env.VITE_FIREBASE_PROJECT_ID = 'staging-b';
      resetCachedProjectIdForTests();
      assert.throws(() => {
        resolveServerFirebaseProjectId();
      }, /CONFIG_DISAGREEMENT/);

      // 6. Production on Vercel -> resolves production project
      process.env.VERCEL_ENV = 'production';
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.VITE_FIREBASE_PROJECT_ID;
      resetCachedProjectIdForTests();
      assert.equal(resolveServerFirebaseProjectId(), PRODUCTION_PROJECT_ID);
    } finally {
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
      else delete process.env.VERCEL;
      if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
      else delete process.env.VERCEL_ENV;
      if (origBackend !== undefined) process.env.FIREBASE_PROJECT_ID = origBackend;
      else delete process.env.FIREBASE_PROJECT_ID;
      if (origFrontend !== undefined) process.env.VITE_FIREBASE_PROJECT_ID = origFrontend;
      else delete process.env.VITE_FIREBASE_PROJECT_ID;
      if (origAppEnv !== undefined) process.env.APP_ENV = origAppEnv;
      else delete process.env.APP_ENV;
      resetCachedProjectIdForTests();
    }
  });

  it('Backend — resolveFirestoreDatabaseId mirrors Vercel environment rules', () => {
    const origVercel = process.env.VERCEL;
    const origVercelEnv = process.env.VERCEL_ENV;
    const origDb = process.env.VITE_FIREBASE_DATABASE_ID;

    try {
      // 1. Preview on Vercel without DB -> fails closed
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'preview';
      delete process.env.VITE_FIREBASE_DATABASE_ID;

      assert.throws(() => {
        resolveFirestoreDatabaseId();
      }, /PREVIEW_STAGING_CONFIG_MISSING/);

      // 2. Preview on Vercel with production DB -> throws safety violation
      process.env.VITE_FIREBASE_DATABASE_ID = PRODUCTION_DATABASE_ID;
      assert.throws(() => {
        resolveFirestoreDatabaseId();
      }, /STAGING_DATA_SAFETY_VIOLATION/);

      // 3. Preview on Vercel with staging DB -> resolves cleanly
      process.env.VITE_FIREBASE_DATABASE_ID = 'staging-named-database';
      assert.equal(resolveFirestoreDatabaseId(), 'staging-named-database');
    } finally {
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
      else delete process.env.VERCEL;
      if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv;
      else delete process.env.VERCEL_ENV;
      if (origDb !== undefined) process.env.VITE_FIREBASE_DATABASE_ID = origDb;
      else delete process.env.VITE_FIREBASE_DATABASE_ID;
    }
  });

  it('Hostname Mismatch — Preview subdomain running VERCEL_ENV=production fails closed', () => {
    const result = detectDeploymentTier({
      isVercel: true,
      vercelEnv: 'production',
      hostname: 'focus-flow-git-review-pre-push.vercel.app',
    });
    assert.ok(result.error);
    assert.match(result.error.message, /HOSTNAME_TIER_MISMATCH/);
  });
});
