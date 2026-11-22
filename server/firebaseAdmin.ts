import { getApps, initializeApp, cert, applicationDefault, deleteApp, type App, type AppOptions } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getAuth, type Auth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import { resolveServerFirebaseProjectId } from './auth.js';

let initializedApp: App | null = null;

/**
 * Initializes and returns the singleton Firebase Admin app.
 * Follows strict environment routing and preview staging safety.
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

  // 1. Check for FIREBASE_SERVICE_ACCOUNT_KEY (JSON string or file path)
  let credential: any;
  const saKeyEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();

  if (saKeyEnv) {
    try {
      if (saKeyEnv.startsWith('{')) {
        const saObj = JSON.parse(saKeyEnv);
        credential = cert(saObj);
      } else {
        const resolvedPath = path.resolve(process.cwd(), saKeyEnv);
        if (fs.existsSync(resolvedPath)) {
          const fileContent = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
          credential = cert(fileContent);
        }
      }
    } catch (err) {
      console.warn('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', err);
    }
  }

  // 2. Fall back to applicationDefault or projectId-only initialization (for GCP environments / emulators)
  if (!credential) {
    try {
      credential = applicationDefault();
    } catch {
      // In local dev/emulator or environments without GCP metadata, initialize with projectId
    }
  }

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

export function resetFirebaseAdminForTests(): void {
  if (initializedApp) {
    try {
      deleteApp(initializedApp);
    } catch {
      // Ignore
    }
    initializedApp = null;
  }
}
