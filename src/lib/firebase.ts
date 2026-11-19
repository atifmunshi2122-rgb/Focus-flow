import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  reauthenticateWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { createSingleFlightRunner } from './authDiagnostics.ts';

// Support production runtime overrides via Vite environment variables
export const activeFirebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  firestoreDatabaseId: import.meta.env?.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || 'ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8',
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(activeFirebaseConfig) : getApp();

// CRITICAL: Initialize Firestore with the specific database ID from config
export const db: Firestore = getFirestore(app, activeFirebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Legacy Executive 23-tab Workbook Sync scopes (Read/Write + file creation)
export const LEGACY_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
] as const;

// Universal Sheet Sync Hub scopes (Strictly Read-Only, zero Drive permissions)
export const SHEET_HUB_READONLY_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
] as const;

// Backward-compatible alias for existing tests and legacy references
export const GOOGLE_SHEETS_SCOPES = LEGACY_SHEETS_SCOPES;

// Basic Google Auth Provider (identity only — Workspace scopes requested separately on demand)
export const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// Backward-compatible alias for basic identity provider
export const googleProvider = basicGoogleProvider;

/**
 * Creates provider for Legacy Executive Sheets Sync (Read/Write).
 */
export function createSheetsGoogleProvider(loginHint?: string | null): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of LEGACY_SHEETS_SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {
    prompt: loginHint ? 'consent' : 'select_account consent',
  };
  if (loginHint) {
    params.login_hint = loginHint;
  }
  provider.setCustomParameters(params);
  return provider;
}

/**
 * Creates provider for Universal Sheet Sync Hub (Strictly Read-Only).
 * Never requests spreadsheet write permissions or Google Drive file access.
 */
export function createSheetHubReadOnlyProvider(loginHint?: string | null): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of SHEET_HUB_READONLY_SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {
    prompt: loginHint ? 'consent' : 'select_account consent',
  };
  if (loginHint) {
    params.login_hint = loginHint;
  }
  provider.setCustomParameters(params);
  return provider;
}

// In-memory access token caches:
// - cachedLegacyAccessToken: Read/Write token for 23-tab executive workbook sync
// - cachedSheetHubAccessToken: Strictly Read-Only token for Universal Sheet Hub
let cachedLegacyAccessToken: string | null = null;
let cachedSheetHubAccessToken: string | null = null;
let isSigningIn = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  if (errMsg.includes('client is offline')) {
    console.warn('Firestore offline notice:', errMsg, 'at path:', path);
    throw new Error(errMsg);
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Firestore connection on app start
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore connection: Client currently offline');
    }
    return false;
  }
}

// Sign in with Google Popup (basic profile/email identity only — no Sheets/Drive scopes upfront)
export const signInWithGoogle = createSingleFlightRunner(
  async (): Promise<{ user: User; accessToken: string }> => {
    const previousUid = auth.currentUser?.uid || null;
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, basicGoogleProvider);
      if (previousUid && result.user.uid !== previousUid) {
        cachedLegacyAccessToken = null;
        cachedSheetHubAccessToken = null;
      }
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || '';
      return { user: result.user, accessToken };
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  }
);

// Incremental Google Sheets & Drive authorization for Legacy Executive 23-tab Workbook Sync (Read/Write)
export const authorizeGoogleSheets = createSingleFlightRunner(
  async (loginHint?: string | null): Promise<{ user: User; accessToken: string }> => {
    try {
      isSigningIn = true;
      const activeUser = auth.currentUser;
      const provider = createSheetsGoogleProvider(loginHint || activeUser?.email || null);
      const result = activeUser
        ? await reauthenticateWithPopup(activeUser, provider)
        : await signInWithPopup(auth, provider);

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || '';
      if (!accessToken) {
        const err = new Error(
          'Google did not return an OAuth access token for Sheets. Please retry and approve spreadsheet access.'
        ) as Error & { code?: string };
        err.code = 'auth/missing-access-token';
        throw err;
      }

      cachedLegacyAccessToken = accessToken;
      return { user: result.user, accessToken };
    } catch (error) {
      console.error('Google Sheets authorization error:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  }
);

// Incremental Google Sheets authorization for Universal Sheet Sync Hub (Strictly Read-Only, zero Drive permissions)
export const authorizeSheetHubReadOnly = createSingleFlightRunner(
  async (loginHint?: string | null): Promise<{ user: User; accessToken: string }> => {
    try {
      isSigningIn = true;
      const activeUser = auth.currentUser;
      const provider = createSheetHubReadOnlyProvider(loginHint || activeUser?.email || null);
      const result = activeUser
        ? await reauthenticateWithPopup(activeUser, provider)
        : await signInWithPopup(auth, provider);

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || '';
      if (!accessToken) {
        const err = new Error(
          'Google did not return an OAuth access token for read-only Sheets. Please retry and approve read-only spreadsheet access.'
        ) as Error & { code?: string };
        err.code = 'auth/missing-access-token';
        throw err;
      }

      cachedSheetHubAccessToken = accessToken;
      return { user: result.user, accessToken };
    } catch (error) {
      console.error('Google Sheets read-only authorization error:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  }
);

export const getAccessToken = async (): Promise<string | null> => {
  return cachedLegacyAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedLegacyAccessToken = token;
};

export const getSheetHubAccessToken = async (): Promise<string | null> => {
  return cachedSheetHubAccessToken || cachedLegacyAccessToken;
};

export const setSheetHubAccessToken = (token: string | null) => {
  cachedSheetHubAccessToken = token;
};

export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
  cachedLegacyAccessToken = null;
  cachedSheetHubAccessToken = null;
  initialAuthPromise = null;
};

export const initAuthListener = (
  onAuthSuccess: (user: User, token: string | null) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      onAuthSuccess(user, cachedLegacyAccessToken || cachedSheetHubAccessToken);
    } else {
      cachedLegacyAccessToken = null;
      cachedSheetHubAccessToken = null;
      onAuthFailure();
    }
  });
};

let initialAuthPromise: Promise<User | null> | null = null;

/**
 * Resolves once Firebase Auth has restored persisted login state on boot,
 * and always returns the live auth.currentUser (never a stale cached user after sign-out).
 */
export async function waitForInitialAuth(): Promise<User | null> {
  const authWithReady = auth as typeof auth & { authStateReady?: () => Promise<void> };
  if (typeof authWithReady.authStateReady === 'function') {
    await authWithReady.authStateReady();
    return auth.currentUser;
  }
  if (!initialAuthPromise) {
    initialAuthPromise = new Promise<User | null>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(auth.currentUser);
      }, 1500);
      const unsub = onAuthStateChanged(auth, (user) => {
        clearTimeout(timeout);
        unsub();
        resolve(user);
      });
    });
  }
  await initialAuthPromise;
  return auth.currentUser;
}

export async function getFirebaseIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
