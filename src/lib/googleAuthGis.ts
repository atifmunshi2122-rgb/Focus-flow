/**
 * FocusFlow — Google Identity Services (GIS) Token Client Integration
 *
 * Integrates the Web Application OAuth 2.0 Client from Google Cloud project `focus-flow-by-atif`:
 * - Client ID: 1010159085609-hcetogi5vbajkg9706m6t9u9h11olfd7.apps.googleusercontent.com
 * - Least-privilege user-granted scopes:
 *     1. https://www.googleapis.com/auth/drive.file (personal Drive duplicate creation)
 *     2. https://www.googleapis.com/auth/spreadsheets (checkbox & cell writeback)
 *
 * Security & Zero-Secret Guarantee:
 * - Google Identity Services Token Client uses purely the public Client ID.
 * - Zero OAuth Client Secret is ever bundled, stored, or referenced client-side.
 * - Returned access tokens are held strictly in ephemeral volatile memory.
 * - Tokens are NEVER written to localStorage, indexedDB, or Cloud Firestore.
 */

import { setSheetHubWriteAccessToken } from './firebase.ts';
import firebaseManifest from '../../firebase-applet-config.json';

export const GHOST_OAUTH_CLIENT_ID =
  '1010159085609-hcetogi5vbajkg9706m6t9u9h11olfd7.apps.googleusercontent.com';
export const GHOST_PROJECT_ID = 'focus-flow-by-atif';
export const GHOST_PROJECT_NUMBER = '1010159085609';

export const GOOGLE_DRIVE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
] as const;

// TypeScript definitions for Google Identity Services (GSI) Token Client & Google Picker
interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: unknown) => void;
  prompt?: string;
  login_hint?: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string; login_hint?: string }) => void;
}

export interface GooglePickerDocument {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  iconUrl?: string;
}

export interface GooglePickerCallbackData {
  action: string;
  docs?: GooglePickerDocument[];
  [key: string]: unknown;
}

declare global {
  interface Window {
    gapi?: {
      load: (
        apiName: string,
        options: { callback: () => void; onerror?: (err: unknown) => void }
      ) => void;
    };
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          hasGrantedAllScopes: (
            tokenResponse: TokenResponse,
            firstScope: string,
            ...restScopes: string[]
          ) => boolean;
        };
      };
      picker?: {
        PickerBuilder: new () => {
          addView: (view: unknown) => any;
          setOAuthToken: (token: string) => any;
          setDeveloperKey: (key: string) => any;
          setAppId: (appId: string) => any;
          setTitle: (title: string) => any;
          enableFeature: (feature: unknown) => any;
          setCallback: (cb: (data: GooglePickerCallbackData) => void) => any;
          build: () => { setVisible: (visible: boolean) => void };
        };
        DocsView: new (viewId: unknown) => {
          setMimeTypes: (mimeTypes: string) => any;
          setMode: (mode: unknown) => any;
          setIncludeFolders: (include: boolean) => any;
        };
        DocsViewMode: {
          LIST: unknown;
          GRID: unknown;
        };
        ViewId: {
          SPREADSHEETS: unknown;
          DOCS: unknown;
          FOLDERS: unknown;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        Feature: {
          NAV_HIDDEN: unknown;
          MULTISELECT_ENABLED: unknown;
          SUPPORT_DRIVES: unknown;
        };
        Response: {
          ACTION: string;
          DOCUMENTS: string;
        };
        Document: {
          ID: string;
          NAME: string;
          URL: string;
          ICON_URL: string;
          MIME_TYPE: string;
        };
      };
    };
  }
}

let gisScriptLoadPromise: Promise<void> | null = null;
let gapiScriptLoadPromise: Promise<void> | null = null;
let pickerLoadPromise: Promise<void> | null = null;

/**
 * Returns the effective Google OAuth Client ID (from environment override, manifest, or focus-flow-by-atif default).
 */
export function getGoogleOAuthClientId(): string {
  try {
    const envClientId = import.meta.env?.VITE_GOOGLE_OAUTH_CLIENT_ID;
    if (typeof envClientId === 'string' && envClientId.trim().length > 10) {
      return envClientId.trim();
    }
  } catch {
    // Non-Vite test or Node environment
  }
  if (
    typeof (firebaseManifest as any)?.oAuthClientId === 'string' &&
    (firebaseManifest as any).oAuthClientId.trim().length > 10
  ) {
    return (firebaseManifest as any).oAuthClientId.trim();
  }
  return GHOST_OAUTH_CLIENT_ID;
}

/**
 * Returns the Google Picker API Key from environment variables (VITE_GOOGLE_PICKER_API_KEY or VITE_GOOGLE_SHEETS_API_KEY).
 * Throws a descriptive configuration error if the environment variable is missing.
 */
export function getGooglePickerApiKey(): string {
  let envKey: string | undefined;

  try {
    envKey =
      import.meta.env?.VITE_GOOGLE_PICKER_API_KEY ||
      import.meta.env?.VITE_GOOGLE_SHEETS_API_KEY ||
      import.meta.env?.VITE_GOOGLE_API_KEY;
  } catch {
    // Non-Vite runtime
  }

  // Fallback to process.env in Node test environments
  if (!envKey) {
    try {
      envKey =
        process.env?.VITE_GOOGLE_PICKER_API_KEY ||
        process.env?.VITE_GOOGLE_SHEETS_API_KEY ||
        process.env?.VITE_GOOGLE_API_KEY;
    } catch {
      // Ignore
    }
  }

  if (typeof envKey === 'string') {
    const cleaned = envKey.trim().replace(/^["']|["']$/g, '');
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  throw new Error(
    'Google Picker API key is missing. Please configure VITE_GOOGLE_PICKER_API_KEY in your environment variables (.env.local).'
  );
}

/**
 * Returns the Google Calendar API Key from environment variables or fallback configuration.
 */
export function getGoogleCalendarApiKey(): string {
  let envKey: string | undefined;

  try {
    envKey = import.meta.env?.VITE_GOOGLE_CALENDAR_API_KEY;
  } catch {
    // Non-Vite runtime
  }

  if (!envKey) {
    try {
      envKey = process.env?.VITE_GOOGLE_CALENDAR_API_KEY;
    } catch {
      // Ignore
    }
  }

  if (typeof envKey === 'string') {
    const cleaned = envKey.trim().replace(/^["']|["']$/g, '');
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  try {
    const manifestKey = (firebaseManifest as { googleCalendarApiKey?: string })?.googleCalendarApiKey;
    if (typeof manifestKey === 'string' && manifestKey.trim().length > 0) {
      return manifestKey.trim();
    }
  } catch {
    // Ignore
  }

  return '';
}

/**
 * Returns the Firebase Cloud Messaging (FCM) API Key from environment variables or fallback configuration.
 */
export function getFirebaseMessagingApiKey(): string {
  let envKey: string | undefined;

  try {
    envKey =
      import.meta.env?.VITE_FIREBASE_MESSAGING_API_KEY ||
      import.meta.env?.FCM_SERVER_KEY;
  } catch {
    // Non-Vite runtime
  }

  if (!envKey) {
    try {
      envKey =
        process.env?.VITE_FIREBASE_MESSAGING_API_KEY ||
        process.env?.FCM_SERVER_KEY;
    } catch {
      // Ignore
    }
  }

  if (typeof envKey === 'string') {
    const cleaned = envKey.trim().replace(/^["']|["']$/g, '');
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  try {
    const manifestKey = (firebaseManifest as { fcmApiKey?: string })?.fcmApiKey;
    if (typeof manifestKey === 'string' && manifestKey.trim().length > 0) {
      return manifestKey.trim();
    }
  } catch {
    // Ignore
  }

  return '';
}

/**
 * Returns the numeric Google Cloud Project Number for focus-flow-by-atif (1010159085609).
 */
export function getGhostProjectNumber(): string {
  try {
    const envNum = import.meta.env?.VITE_GOOGLE_PROJECT_NUMBER;
    if (typeof envNum === 'string' && envNum.trim().length > 5) {
      return envNum.trim();
    }
  } catch {
    // Non-Vite test or Node environment
  }
  return GHOST_PROJECT_NUMBER;
}

/**
 * Dynamically loads the official Google API client loader script (apis.google.com/js/api.js).
 */
export function loadGoogleApiScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.gapi) {
    return Promise.resolve();
  }

  if (gapiScriptLoadPromise) {
    return gapiScriptLoadPromise;
  }

  gapiScriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="apis.google.com/js/api.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google API loader script.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gapiScriptLoadPromise = null;
      reject(new Error('Failed to load Google API Client script (apis.google.com/js/api.js).'));
    };
    document.head.appendChild(script);
  });

  return gapiScriptLoadPromise;
}

/**
 * Loads and initializes the Google Picker API (gapi.load('picker')).
 */
export async function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.google?.picker) {
    return;
  }

  if (pickerLoadPromise) {
    return pickerLoadPromise;
  }

  await loadGoogleApiScript();

  pickerLoadPromise = new Promise<void>((resolve, reject) => {
    if (!window.gapi?.load) {
      reject(new Error('window.gapi.load is not available after loading apis.google.com/js/api.js.'));
      return;
    }

    window.gapi.load('picker', {
      callback: () => resolve(),
      onerror: (err: unknown) => {
        pickerLoadPromise = null;
        reject(
          new Error(
            `Failed to load Google Picker API: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      },
    });
  });

  return pickerLoadPromise;
}

/**
 * Dynamically loads the official Google Identity Services client script.
 * Deduplicates concurrent calls via a single-flight Promise.
 */
export function loadGoogleIdentityServicesScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (gisScriptLoadPromise) {
    return gisScriptLoadPromise;
  }

  gisScriptLoadPromise = new Promise<void>((resolve, reject) => {
    // Check if script tag is already in DOM
    const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptLoadPromise = null;
      reject(new Error('Failed to load Google Identity Services client script (accounts.google.com/gsi/client).'));
    };
    document.head.appendChild(script);
  });

  return gisScriptLoadPromise;
}

// Isolated ephemeral memory cache for focus-flow-by-atif GIS tokens (strictly separated from Firebase Auth tokens)
let cachedGisDualCopyToken: string | null = null;

export function getGisDualCopyToken(): string | null {
  return cachedGisDualCopyToken;
}

export function setGisDualCopyToken(token: string | null): void {
  cachedGisDualCopyToken = token;
}

/**
 * Requests an OAuth 2.0 Access Token with Google Drive & Google Sheets permissions
 * strictly using the Web Application Client from Google Cloud project `focus-flow-by-atif`.
 *
 * Scopes:
 * - https://www.googleapis.com/auth/drive.file (Only files created/opened by FocusFlow)
 * - https://www.googleapis.com/auth/spreadsheets (Read & write cell updates)
 *
 * Note: Never falls back to Firebase Auth provider to avoid project domain mismatch (403).
 */
export async function requestGoogleDriveToken(options?: {
  loginHint?: string | null;
  prompt?: 'select_account' | 'consent' | '';
}): Promise<string> {
  const clientId = getGoogleOAuthClientId();
  const scopes = GOOGLE_DRIVE_SHEETS_SCOPES.join(' ');

  // Load Google Identity Services client script
  await loadGoogleIdentityServicesScript();

  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error(
      'Google Identity Services client is not available. Please allow popups and ensure accounts.google.com is not blocked by your browser extensions.'
    );
  }

  return await new Promise<string>((resolve, reject) => {
    let settled = false;

    try {
      const client = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: clientId,
        scope: scopes,
        prompt: options?.prompt !== undefined ? options.prompt : 'select_account',
        login_hint: options?.loginHint || undefined,
        callback: (res: TokenResponse) => {
          if (settled) return;
          settled = true;

          if (res.error) {
            const errMsg = res.error_description || res.error;
            if (res.error === 'access_denied') {
              reject(
                new Error(
                  `Google authorization was denied (access_denied: ${errMsg}). Ensure your Google account is added under Test Users in Google Cloud project ${GHOST_PROJECT_ID} and all requested scopes are granted.`
                )
              );
            } else if (res.error === 'popup_closed_by_user') {
              reject(new Error('Google authorization popup was closed before completing consent.'));
            } else {
              reject(new Error(`Google authorization error (${res.error}): ${errMsg}`));
            }
            return;
          }

          if (!res.access_token) {
            reject(new Error('Google did not return an access token. Please verify permissions and retry.'));
            return;
          }

          // Verify granted scopes
          if (window.google?.accounts?.oauth2?.hasGrantedAllScopes) {
            const hasAll = window.google.accounts.oauth2.hasGrantedAllScopes(
              res,
              GOOGLE_DRIVE_SHEETS_SCOPES[0],
              ...GOOGLE_DRIVE_SHEETS_SCOPES.slice(1)
            );
            if (!hasAll) {
              reject(
                new Error(
                  `Google authorization granted partial permissions (${res.scope || 'insufficient'}). Both Google Sheets and Google Drive permissions are required. Please re-authenticate and check all permission checkboxes on Google's consent screen.`
                )
              );
              return;
            }
          }

          // Store in ephemeral memory cache for immediate Sheet Hub GIS Dual-Copy use
          // Keeps focus-flow-by-atif GIS credentials in ephemeral memory cache
          setGisDualCopyToken(res.access_token);
          resolve(res.access_token);
        },
        error_callback: (err: unknown) => {
          if (settled) return;
          settled = true;
          console.warn('[GoogleAuthGIS] GIS error callback invoked:', err);
          reject(
            new Error(
              `Google Identity Services authorization failed: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        },
      });

      client.requestAccessToken();
    } catch (initErr) {
      if (!settled) {
        settled = true;
        reject(initErr);
      }
    }
  });
}

