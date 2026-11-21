import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  reauthenticateWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  Firestore,
} from 'firebase/firestore';
import {
  resolveFirebaseConfiguration,
  ConfigurationResolutionResult,
} from './firebaseConfigResolver.ts';
import { createSingleFlightRunner } from './authDiagnostics.ts';

// Resolve environment-aware Firebase configuration with Preview Staging Safety Gate
export const configResolution: ConfigurationResolutionResult = resolveFirebaseConfiguration();
export const configurationError: Error | null = configResolution.error;

export const activeFirebaseConfig = configResolution.config || {
  apiKey: 'preview-staging-blocked',
  authDomain: 'preview-staging-blocked.firebaseapp.com',
  projectId: 'preview-staging-blocked',
  storageBucket: 'preview-staging-blocked.firebasestorage.app',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
  firestoreDatabaseId: 'preview-staging-blocked',
  tier: configResolution.tier,
  isStagingIsolated: true,
};

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(activeFirebaseConfig) : getApp();

// CRITICAL: Initialize Firestore with the specific database ID from config
export const db: Firestore = getFirestore(app, activeFirebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Initialize Firebase Analytics (Browser environment only, guarded against SSR/Node/test)
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && activeFirebaseConfig.measurementId) {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics unsupported or blocked (e.g. adblocker, private browsing)
    });
}

// Legacy Executive 23-tab Workbook Sync scopes (Read/Write + file creation)
export const LEGACY_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
] as const;

// Universal Sheet Sync Hub scopes (Strictly Read-Only, zero Drive permissions)
export const SHEET_HUB_READONLY_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
] as const;

// Universal Sheet Sync Hub Write scope (Least-privilege spreadsheet editing only, zero Drive permissions)
export const SHEET_HUB_WRITE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

// Universal Sheet Sync Hub Dual-Copy scopes (Drive duplication + Spreadsheets read/write)
export const SHEET_HUB_DUAL_COPY_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
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

/**
 * Creates provider for Universal Sheet Sync Hub Two-Way Cell Sync (Read/Write Spreadsheets only, zero Drive access).
 */
export function createSheetHubWriteProvider(loginHint?: string | null): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of SHEET_HUB_WRITE_SCOPES) {
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
 * Creates provider for Universal Sheet Sync Hub Dual-Copy (Drive Duplicate + Spreadsheets).
 */
export function createSheetHubDualCopyProvider(loginHint?: string | null): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of SHEET_HUB_DUAL_COPY_SCOPES) {
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
// - cachedSheetHubWriteAccessToken: Least-privilege Spreadsheets write token for Sheet Hub two-way mark/unmark
let cachedLegacyAccessToken: string | null = null;
let cachedSheetHubAccessToken: string | null = null;
let cachedSheetHubWriteAccessToken: string | null = null;
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
  if (configurationError) {
    console.warn('[firebase] Connection test skipped: Staging configuration required');
    return false;
  }
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
    if (configurationError) {
      throw configurationError;
    }
    const previousUid = auth.currentUser?.uid || null;
    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, basicGoogleProvider);
      if (previousUid && result.user.uid !== previousUid) {
        cachedLegacyAccessToken = null;
        cachedSheetHubAccessToken = null;
        cachedSheetHubWriteAccessToken = null;
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

// Sign in with Email and Password
export const signInWithEmail = createSingleFlightRunner(
  async (email: string, password: string): Promise<{ user: User }> => {
    if (configurationError) {
      throw configurationError;
    }
    try {
      isSigningIn = true;
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      return { user: result.user };
    } catch (error) {
      console.error('Email sign in error:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  }
);

// Sign up with Email and Password
export const signUpWithEmail = createSingleFlightRunner(
  async (email: string, password: string): Promise<{ user: User }> => {
    if (configurationError) {
      throw configurationError;
    }
    try {
      isSigningIn = true;
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      return { user: result.user };
    } catch (error) {
      console.error('Email sign up error:', error);
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

// Incremental Google Sheets write authorization for Universal Sheet Sync Hub two-way mark/unmark
export const authorizeSheetHubWrite = createSingleFlightRunner(
  async (loginHint?: string | null): Promise<{ user: User; accessToken: string }> => {
    try {
      isSigningIn = true;
      const activeUser = auth.currentUser;
      const provider = createSheetHubWriteProvider(loginHint || activeUser?.email || null);
      const result = activeUser
        ? await reauthenticateWithPopup(activeUser, provider)
        : await signInWithPopup(auth, provider);

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || '';
      if (!accessToken) {
        const err = new Error(
          'Google did not return an OAuth access token for editing Sheets. Please retry and approve spreadsheet edit access.'
        ) as Error & { code?: string };
        err.code = 'auth/missing-access-token';
        throw err;
      }

      cachedSheetHubWriteAccessToken = accessToken;
      return { user: result.user, accessToken };
    } catch (error) {
      console.error('Google Sheets write authorization error:', error);
      throw error;
    } finally {
      isSigningIn = false;
    }
  }
);

// Incremental Google Drive & Sheets authorization for Dual-Copy Google Drive Duplicate + Two-Way Sync
export const authorizeSheetHubDualCopy = createSingleFlightRunner(
  async (loginHint?: string | null): Promise<{ user: User; accessToken: string }> => {
    try {
      isSigningIn = true;
      const activeUser = auth.currentUser;
      const provider = createSheetHubDualCopyProvider(loginHint || activeUser?.email || null);
      const result = activeUser
        ? await reauthenticateWithPopup(activeUser, provider)
        : await signInWithPopup(auth, provider);

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || '';
      if (!accessToken) {
        const err = new Error(
          'Google did not return an OAuth access token for Drive & Sheets. Please retry and approve permissions.'
        ) as Error & { code?: string };
        err.code = 'auth/missing-access-token';
        throw err;
      }

      cachedSheetHubWriteAccessToken = accessToken;
      return { user: result.user, accessToken };
    } catch (error) {
      console.error('Google Drive & Sheets authorization error:', error);
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
  return cachedSheetHubAccessToken || cachedSheetHubWriteAccessToken || cachedLegacyAccessToken;
};

export const setSheetHubAccessToken = (token: string | null) => {
  cachedSheetHubAccessToken = token;
};

export const getSheetHubWriteAccessToken = async (): Promise<string | null> => {
  return cachedSheetHubWriteAccessToken || cachedLegacyAccessToken;
};

export const setSheetHubWriteAccessToken = (token: string | null) => {
  cachedSheetHubWriteAccessToken = token;
};

export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
  cachedLegacyAccessToken = null;
  cachedSheetHubAccessToken = null;
  cachedSheetHubWriteAccessToken = null;
  initialAuthPromise = null;
};

export const initAuthListener = (
  onAuthSuccess: (user: User, token: string | null) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      onAuthSuccess(
        user,
        cachedLegacyAccessToken || cachedSheetHubWriteAccessToken || cachedSheetHubAccessToken
      );
    } else {
      cachedLegacyAccessToken = null;
      cachedSheetHubAccessToken = null;
      cachedSheetHubWriteAccessToken = null;
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
