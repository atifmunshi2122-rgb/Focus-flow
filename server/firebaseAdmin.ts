import { getApps, initializeApp, cert, applicationDefault, deleteApp, type App, type AppOptions } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getAuth, type Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { resolveServerFirebaseProjectId } from './auth.js';

export type CredentialSource =
  | 'env_json'
  | 'env_key'
  | 'file'
  | 'adc'
  | 'project_id_only'
  | 'none';

export interface ServiceAccountMetadata {
  clientEmail: string | null;
  projectId: string | null;
  hasCredential: boolean;
  source: CredentialSource;
}

let initializedApp: App | null = null;
let activeMetadata: ServiceAccountMetadata = {
  clientEmail: null,
  projectId: null,
  hasCredential: false,
  source: 'none',
};

/**
 * Normalizes PEM private key strings, converting escaped '\\n' to actual newlines.
 * Never logs or prints the key.
 */
function normalizePrivateKey(rawKey: unknown): string | null {
  if (typeof rawKey !== 'string') return null;
  let key = rawKey.trim();
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  return key;
}

/**
 * Validates and normalizes raw parsed service account object.
 * Returns null if the structure is invalid or insecure.
 */
function parseAndValidateServiceAccount(
  rawObj: unknown,
  expectedProjectId: string
): { credentialObj: Record<string, any>; metadata: ServiceAccountMetadata } | null {
  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
    console.warn('[FirebaseAdmin] Malformed service account payload: expected a JSON object.');
    return null;
  }

  const obj = rawObj as Record<string, any>;
  const credProjectId = typeof obj.project_id === 'string' ? obj.project_id.trim() : null;
  const clientEmail = typeof obj.client_email === 'string' ? obj.client_email.trim() : null;
  const normalizedKey = normalizePrivateKey(obj.private_key);

  // 1. Project ID Mismatch Guard
  if (credProjectId && expectedProjectId && credProjectId !== expectedProjectId) {
    throw new Error(
      `[FIREBASE_CREDENTIAL_PROJECT_MISMATCH] Service Account credential project_id ('${credProjectId}') does not match expected server project ('${expectedProjectId}'). Cross-project credential usage is strictly forbidden.`
    );
  }

  // 2. Client Email Validation
  if (!clientEmail || !clientEmail.includes('@') || !clientEmail.includes('gserviceaccount.com')) {
    console.warn('[FirebaseAdmin] Service account credential is missing a valid client_email address.');
    return null;
  }

  // 3. Private Key Validation
  if (!normalizedKey || !normalizedKey.includes('BEGIN PRIVATE KEY')) {
    console.warn('[FirebaseAdmin] Service account credential is missing a valid PEM private_key.');
    return null;
  }

  const normalizedObj = {
    ...obj,
    project_id: credProjectId || expectedProjectId,
    client_email: clientEmail,
    private_key: normalizedKey,
  };

  return {
    credentialObj: normalizedObj,
    metadata: {
      clientEmail,
      projectId: credProjectId || expectedProjectId,
      hasCredential: true,
      source: 'none', // Set by caller
    },
  };
}

/**
 * Initializes and returns the singleton Firebase Admin app.
 * Follows strict environment routing, credential validation, and preview staging safety.
 */
export function getFirebaseAdminApp(): App {
  if (initializedApp) {
    return initializedApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    initializedApp = existingApps[0];
    return initializedApp;
  }

  const projectId = resolveServerFirebaseProjectId();

  let credential: any = null;
  let source: CredentialSource = 'none';
  let clientEmail: string | null = null;

  // 1. Check for FIREBASE_SERVICE_ACCOUNT_JSON (preferred) or FIREBASE_SERVICE_ACCOUNT_KEY
  const rawEnvJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const rawEnvKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  const candidateEnv = rawEnvJson || rawEnvKey;
  const envSource = rawEnvJson ? 'env_json' : 'env_key';

  if (candidateEnv) {
    try {
      if (candidateEnv.startsWith('{')) {
        // Direct JSON string
        const parsed = JSON.parse(candidateEnv);
        const result = parseAndValidateServiceAccount(parsed, projectId);
        if (result) {
          credential = cert(result.credentialObj);
          source = envSource;
          clientEmail = result.metadata.clientEmail;
        }
      } else {
        // File path reference
        const resolvedPath = path.resolve(process.cwd(), candidateEnv);
        if (fs.existsSync(resolvedPath)) {
          const fileContent = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
          const result = parseAndValidateServiceAccount(fileContent, projectId);
          if (result) {
            credential = cert(result.credentialObj);
            source = 'file';
            clientEmail = result.metadata.clientEmail;
          }
        } else {
          console.warn('[FirebaseAdmin] Service account file path specified in environment does not exist.');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('[FIREBASE_CREDENTIAL_PROJECT_MISMATCH]')) {
        throw err;
      }
      // Never log raw key or candidate string to prevent credential leakage
      console.warn('[FirebaseAdmin] Failed to parse service account credential from environment. Verify valid JSON.');
    }
  }

  // 2. Fall back to Application Default Credentials (ADC) where supported (GCP / Cloud Run / App Engine)
  if (!credential) {
    try {
      credential = applicationDefault();
      source = 'adc';
    } catch {
      // In local dev/emulator or environments without GCP metadata, fall back to project_id_only
      source = 'project_id_only';
    }
  }

  activeMetadata = {
    clientEmail,
    projectId,
    hasCredential: Boolean(credential),
    source,
  };

  const appOptions: AppOptions = {
    projectId,
    ...(credential ? { credential } : {}),
  };

  initializedApp = initializeApp(appOptions);
  return initializedApp;
}

/**
 * Returns Firebase Admin Firestore instance.
 */
export function getAdminFirestore(): Firestore {
  const app = getFirebaseAdminApp();
  return getFirestore(app);
}

/**
 * Returns Firebase Admin Messaging instance for push notifications.
 */
export function getAdminMessaging(): Messaging {
  const app = getFirebaseAdminApp();
  return getMessaging(app);
}

/**
 * Returns Firebase Admin Auth instance.
 */
export function getAdminAuth(): Auth {
  const app = getFirebaseAdminApp();
  return getAuth(app);
}

/**
 * Returns safe metadata regarding current Firebase Admin credentials without exposing private keys.
 */
export function getServiceAccountInfo(): ServiceAccountMetadata {
  getFirebaseAdminApp();
  return { ...activeMetadata };
}

/**
 * Returns whether valid service account credentials (env, file, or ADC) are loaded.
 */
export function hasServiceAccountCredentials(): boolean {
  getFirebaseAdminApp();
  return activeMetadata.hasCredential && activeMetadata.source !== 'project_id_only';
}

/**
 * Resets Firebase Admin singleton and deletes app instances for clean testing.
 */
export function resetFirebaseAdminForTests(): void {
  if (initializedApp) {
    try {
      deleteApp(initializedApp);
    } catch {
      // Ignore
    }
    initializedApp = null;
  }
  const apps = getApps();
  for (const app of apps) {
    try {
      deleteApp(app);
    } catch {
      // Ignore
    }
  }
  activeMetadata = {
    clientEmail: null,
    projectId: null,
    hasCredential: false,
    source: 'none',
  };
}
