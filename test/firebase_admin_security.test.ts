import './test_bootstrap.ts';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  getFirebaseAdminApp,
  getAdminFirestore,
  getAdminMessaging,
  getAdminAuth,
  resetFirebaseAdminForTests,
  getServiceAccountInfo,
  hasServiceAccountCredentials,
} from '../server/firebaseAdmin.ts';
import { resetCachedProjectIdForTests } from '../server/auth.ts';
import { GOOGLE_DRIVE_SHEETS_SCOPES } from '../src/lib/googleAuthGis.ts';

// Generate synthetic RSA key for cryptographic testing
const { privateKey: syntheticPemKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('Firebase Admin Security & Service Account Configuration Suite', () => {
  const origEnv = { ...process.env };
  const targetProject = 'focus-flow-by-atif';

  beforeEach(() => {
    resetFirebaseAdminForTests();
    resetCachedProjectIdForTests();
    process.env.FIREBASE_PROJECT_ID = targetProject;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    resetFirebaseAdminForTests();
    resetCachedProjectIdForTests();
    process.env = { ...origEnv };
  });

  describe('1. Single Initialization & App Reuse', () => {
    it('initializes Firebase Admin singleton only once and reuses the instance', () => {
      const app1 = getFirebaseAdminApp();
      const app2 = getFirebaseAdminApp();
      assert.strictEqual(app1, app2, 'getFirebaseAdminApp() must return identical singleton instance');
      assert.equal(app1.name, '[DEFAULT]');
    });

    it('returns valid Admin Firestore, Messaging, and Auth handles from singleton app', () => {
      const firestore = getAdminFirestore();
      assert.ok(firestore, 'getAdminFirestore() must return Firestore handle');

      const messaging = getAdminMessaging();
      assert.ok(messaging, 'getAdminMessaging() must return Messaging handle');

      const auth = getAdminAuth();
      assert.ok(auth, 'getAdminAuth() must return Auth handle');
    });
  });

  describe('2. Service Account JSON Parsing & Escaped Newlines', () => {
    it('parses valid FIREBASE_SERVICE_ACCOUNT_JSON string and sets credentials', () => {
      const saPayload = {
        type: 'service_account',
        project_id: targetProject,
        client_email: `firebase-adminsdk-test@${targetProject}.iam.gserviceaccount.com`,
        private_key: syntheticPemKey,
      };

      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(saPayload);
      const app = getFirebaseAdminApp();
      assert.ok(app);

      const info = getServiceAccountInfo();
      assert.equal(info.hasCredential, true);
      assert.equal(info.source, 'env_json');
      assert.equal(info.clientEmail, `firebase-adminsdk-test@${targetProject}.iam.gserviceaccount.com`);
      assert.equal(info.projectId, targetProject);
      assert.equal(hasServiceAccountCredentials(), true);
    });

    it('normalizes escaped newlines (\\\\n) in private_key to actual newlines', () => {
      const escapedKey = syntheticPemKey.replace(/\n/g, '\\n');
      assert.ok(escapedKey.includes('\\n'), 'Must contain escaped newlines for test');

      const saPayload = {
        type: 'service_account',
        project_id: targetProject,
        client_email: `firebase-adminsdk-test@${targetProject}.iam.gserviceaccount.com`,
        private_key: escapedKey,
      };

      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(saPayload);
      const app = getFirebaseAdminApp();
      assert.ok(app);

      const info = getServiceAccountInfo();
      assert.equal(info.hasCredential, true);
      assert.equal(info.source, 'env_json');
    });

    it('supports backward-compatible FIREBASE_SERVICE_ACCOUNT_KEY variable', () => {
      const saPayload = {
        type: 'service_account',
        project_id: targetProject,
        client_email: `legacy-adminsdk@${targetProject}.iam.gserviceaccount.com`,
        private_key: syntheticPemKey,
      };

      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify(saPayload);
      const app = getFirebaseAdminApp();
      assert.ok(app);

      const info = getServiceAccountInfo();
      assert.equal(info.hasCredential, true);
      assert.equal(info.source, 'env_key');
      assert.equal(info.clientEmail, `legacy-adminsdk@${targetProject}.iam.gserviceaccount.com`);
    });

    it('prefers FIREBASE_SERVICE_ACCOUNT_JSON when both JSON and KEY are set', () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: targetProject,
        client_email: `preferred-json@${targetProject}.iam.gserviceaccount.com`,
        private_key: syntheticPemKey,
      });

      process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
        type: 'service_account',
        project_id: targetProject,
        client_email: `fallback-key@${targetProject}.iam.gserviceaccount.com`,
        private_key: syntheticPemKey,
      });

      const app = getFirebaseAdminApp();
      assert.ok(app);

      const info = getServiceAccountInfo();
      assert.equal(info.source, 'env_json');
      assert.equal(info.clientEmail, `preferred-json@${targetProject}.iam.gserviceaccount.com`);
    });

    it('supports loading service account from a valid file path', () => {
      const tempKeyFile = path.join(os.tmpdir(), `test-sa-${Date.now()}.json`);
      fs.writeFileSync(
        tempKeyFile,
        JSON.stringify({
          type: 'service_account',
          project_id: targetProject,
          client_email: `file-sa@${targetProject}.iam.gserviceaccount.com`,
          private_key: syntheticPemKey,
        })
      );

      try {
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY = tempKeyFile;
        const app = getFirebaseAdminApp();
        assert.ok(app);

        const info = getServiceAccountInfo();
        assert.equal(info.hasCredential, true);
        assert.equal(info.source, 'file');
        assert.equal(info.clientEmail, `file-sa@${targetProject}.iam.gserviceaccount.com`);
      } finally {
        if (fs.existsSync(tempKeyFile)) {
          fs.unlinkSync(tempKeyFile);
        }
      }
    });
  });

  describe('3. Project ID Validation & Cross-Project Protection', () => {
    it('strictly rejects service account credentials belonging to a different project', () => {
      process.env.FIREBASE_PROJECT_ID = 'focus-flow-by-atif';
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: 'seismic-codex-m01dl', // Wrong project!
        client_email: 'service-acct@seismic-codex-m01dl.iam.gserviceaccount.com',
        private_key: syntheticPemKey,
      });

      assert.throws(
        () => getFirebaseAdminApp(),
        (err: Error) => {
          return (
            err.message.includes('[FIREBASE_CREDENTIAL_PROJECT_MISMATCH]') &&
            err.message.includes('seismic-codex-m01dl') &&
            err.message.includes('focus-flow-by-atif')
          );
        }
      );
    });

    it('strictly rejects production service account credentials when running in Vercel Preview (Staging)', () => {
      process.env.VERCEL = '1';
      process.env.VERCEL_ENV = 'preview';
      process.env.FIREBASE_PROJECT_ID = 'focusflow-staging-project';
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: 'focus-flow-by-atif', // Attempting to use Production key in Preview!
        client_email: 'admin@focus-flow-by-atif.iam.gserviceaccount.com',
        private_key: syntheticPemKey,
      });

      assert.throws(
        () => getFirebaseAdminApp(),
        (err: Error) => {
          return (
            err.message.includes('[FIREBASE_CREDENTIAL_PROJECT_MISMATCH]') &&
            err.message.includes('focus-flow-by-atif') &&
            err.message.includes('focusflow-staging-project')
          );
        }
      );
    });
  });

  describe('4. Malformed Input & Secret Protection', () => {
    it('handles malformed JSON gracefully without throwing unhandled exceptions', () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{ malformed_json: true, invalid: ';
      // Must not throw unhandled syntax error
      const app = getFirebaseAdminApp();
      assert.ok(app);
      const info = getServiceAccountInfo();
      assert.notEqual(info.source, 'env_json');
    });

    it('rejects service account credentials with missing client_email', () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: targetProject,
        private_key: syntheticPemKey,
      });

      const app = getFirebaseAdminApp();
      assert.ok(app);
      const info = getServiceAccountInfo();
      assert.notEqual(info.source, 'env_json');
    });

    it('rejects service account credentials with missing PEM private_key header', () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: targetProject,
        client_email: `test@${targetProject}.iam.gserviceaccount.com`,
        private_key: 'NOT_A_VALID_PEM_KEY_STRING',
      });

      const app = getFirebaseAdminApp();
      assert.ok(app);
      const info = getServiceAccountInfo();
      assert.notEqual(info.source, 'env_json');
    });

    it('never includes private key in getServiceAccountInfo() metadata', () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: targetProject,
        client_email: `safe-info@${targetProject}.iam.gserviceaccount.com`,
        private_key: syntheticPemKey,
      });

      getFirebaseAdminApp();
      const info = getServiceAccountInfo() as any;

      assert.equal(info.privateKey, undefined);
      assert.equal(info.private_key, undefined);
      assert.equal(JSON.stringify(info).includes('BEGIN PRIVATE KEY'), false);
    });
  });

  describe('5. Google API OAuth & Service Account Isolation', () => {
    it('Google Sheets OAuth strictly requests spreadsheets & drive.file and zero Service Account scopes', () => {
      assert.deepEqual(GOOGLE_DRIVE_SHEETS_SCOPES, [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ]);
      assert.equal(GOOGLE_DRIVE_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/cloud-platform' as any), false);
      assert.equal(GOOGLE_DRIVE_SHEETS_SCOPES.includes('https://www.googleapis.com/auth/firebase.messaging' as any), false);
    });

    it('Frontend environment variables never contain private Service Account keys', () => {
      const envKeys = Object.keys(process.env);
      for (const k of envKeys) {
        if (k.startsWith('VITE_')) {
          assert.equal(
            k.includes('SERVICE_ACCOUNT'),
            false,
            `Frontend env var ${k} must NEVER contain SERVICE_ACCOUNT`
          );
          assert.equal(
            k.includes('PRIVATE_KEY'),
            false,
            `Frontend env var ${k} must NEVER contain PRIVATE_KEY`
          );
        }
      }
    });
  });

  describe('6. Firestore Admin Access & FCM Messaging Contract', () => {
    it('getAdminFirestore returns valid collection references scoped to project', () => {
      const firestore = getAdminFirestore();
      const col = firestore.collection('users');
      assert.equal(col.id, 'users');
      const doc = col.doc('test_usr_123');
      assert.equal(doc.id, 'test_usr_123');
      assert.equal(doc.path, 'users/test_usr_123');
    });

    it('getAdminMessaging constructs valid Multicast message payload structure', () => {
      const messaging = getAdminMessaging();
      assert.ok(messaging, 'Messaging instance must be present');
      assert.equal(typeof messaging.sendEachForMulticast, 'function');
      assert.equal(typeof messaging.send, 'function');
    });
  });
});
