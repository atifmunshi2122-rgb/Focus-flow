import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

// Configure Google Auth Provider with Google Sheets & Drive scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory access token cache
let cachedAccessToken: string | null = null;
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

// Sign in with Google Popup
export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || null;

    if (!accessToken) {
      console.warn('No Google OAuth access token returned in credential, proceeding with user authentication');
    }

    cachedAccessToken = accessToken;
    return { user: result.user, accessToken: accessToken || '' };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const signOut = async (): Promise<void> => {
  await firebaseSignOut(auth);
  cachedAccessToken = null;
};

export const initAuthListener = (
  onAuthSuccess: (user: User, token: string | null) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

let initialAuthPromise: Promise<User | null> | null = null;

/**
 * Resolves once Firebase Auth has restored persisted login state on boot.
 */
export function waitForInitialAuth(): Promise<User | null> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
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
  return initialAuthPromise;
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
