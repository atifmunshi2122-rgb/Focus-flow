# Complete Remaining API & Credential Audit — FocusFlow & Finance v1.7.0

**Audit Date:** 2026-11-23  
**Repository:** `focusflow-&-finance` (`v1.7.0`)  
**Production Domain:** `https://focus-flow-by-atif.vercel.app`  
**Firebase Project:** `focus-flow-by-atif` (Firestore DB: `(default)`)  
**Google Workspace / OAuth Project:** `ghost-7b055` (Project Number: `965140210258`)

---

## 1. Executive Summary

A full repository scan across `package.json`, `server/`, `src/`, `api/`, `public/`, `scripts/`, `.github/workflows/ci.yml`, `vercel.json`, `firebase.json`, `firestore.rules`, `storage.rules`, `.env.example`, `.env.local`, and `VERCEL_ENVIRONMENT_VARIABLES.md` confirms:

1. **Zero third-party AI, Payment, Email, SMS, Weather, Exchange-Rate, Error-Tracking, or People APIs** are used or required by this application (`Gemini`, `OpenAI`, `Razorpay`, `Stripe`, `Sentry`, `Resend/SendGrid`, `Twilio`, `Weather`, `Exchange Rate`, `Google People API` do not exist anywhere in the codebase).
2. **Core remaining credential gaps** are limited to **5 production secrets/keys** (none of which are stored in the repository):
   - `FIREBASE_SERVICE_ACCOUNT_JSON` **and** `FIREBASE_SERVICE_ACCOUNT_KEY` (same Service Account JSON — see critical discrepancy in Section 4)
   - `GOOGLE_CALENDAR_CLIENT_SECRET`
   - `INTEGRATION_ENCRYPTION_KEY`
   - `CRON_SECRET`
   - `VITE_FIREBASE_VAPID_KEY`
3. **Several implementation & configuration mismatches** exist independently of missing credentials (documented in Section 4).

---

## 2. Complete API Classification (Groups A–E)

### Group A — Already Configured and Working (Client / Core Config Present)

| API / Service | Source-Code Usage | Required Functionality | Cloud / Console Enablement | Credential Requirement | Current Status | Exact Missing Configuration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Firebase Authentication** | `src/lib/firebase.ts`, `server/auth.ts` (`securetoken@system.gserviceaccount.com` JWT verification) | Email/Password & Google Sign-In, Bearer JWT verification on `/api/*` | Firebase Console (`focus-flow-by-atif`) -> Authentication (Email/Password + Google providers) | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_ID` | Configured in `.env.local` & `firebase-applet-config.json` | Ensure all vars are set in Vercel Production & `focus-flow-by-atif.vercel.app` is in Authorized Domains |
| **Cloud Firestore (Client SDK)** | `src/lib/firebase.ts`, `src/lib/firestoreService.ts`, `src/lib/sheetHub/sheetHubStore.ts` | Primary cloud persistence for all signed-in user data, tasks, finance, study OS, native sheets | Firebase Console (`focus-flow-by-atif`) -> Firestore Database `(default)` | `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_ID=(default)` + `firestore.rules` | Configured & rules present (`firestore.rules`) | None for client SDK (server Admin SDK requires Service Account — see Group C) |
| **Vercel Serverless & Cron Hosting** | `api/index.ts`, `vercel.json` (`/api/cron/notifications` at `0 8 * * *`) | Production SPA hosting, `/api/*` Express serverless routing, daily notification cron | Vercel Dashboard (`focus-flow-by-atif.vercel.app`) | `APP_URL`, `ALLOWED_ORIGINS`, `NODE_ENV`, `REQUIRE_AUTH`, `ALLOW_GUEST`, `CRON_SECRET` | Deployed on Vercel | Missing `CRON_SECRET` & production env vars; see Section 4 for `server/db.ts` Vercel EROFS bug |

---

### Group B — Configured in Code/Env but Requires Console Verification

| API / Service | Source-Code Usage | Required Functionality | Cloud / Console Enablement | Credential Requirement | Current Status | Exact Missing Configuration / Verification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Sheets API (v4)** | `server/sheetsWorker.ts`, `server/universalSheetsWorker.ts`, `server/sheetHubWriteWorker.ts`, `server/driveWorker.ts` | 23-tab workbook export, Sheet Hub inspect/pull, two-way checkbox write-back | Enable **Google Sheets API** in `ghost-7b055` **and** `focus-flow-by-atif` (if using Firebase Auth write-back button) | User OAuth Bearer token (`x-google-access-token`) + `VITE_GOOGLE_PICKER_API_KEY` | Keys in `.env.local` & `firebase-applet-config.json` | Verify Sheets API is enabled in both GCP projects; verify HTTP Referrer + API restrictions on key |
| **Google Drive API (v3)** | `server/driveWorker.ts` (`https://www.googleapis.com/drive/v3/files`) | Dual-Copy personal Drive duplicate creation (`drive.file` scope) | Enable **Google Drive API** in `ghost-7b055` | GIS OAuth token via `ghost-7b055` (`drive.file` scope) | OAuth Client ID hardcoded default in `src/lib/googleAuthGis.ts` | Verify Drive API enabled in `ghost-7b055`; add `https://focus-flow-by-atif.vercel.app` to Authorized JS Origins; add user email to OAuth Test Users |
| **Google Picker API** | `src/components/sheets-hub/GoogleSheetPickerModal.tsx`, `src/lib/googleAuthGis.ts` | "Browse My Google Drive" private spreadsheet selection modal | Enable **Google Picker API** in `ghost-7b055` | `VITE_GOOGLE_PICKER_API_KEY`, `VITE_GOOGLE_PROJECT_NUMBER=965140210258`, GIS OAuth token | Configured in `.env.local` | Verify Picker API enabled in `ghost-7b055` and key restriction permits Picker API |
| **Google Identity Services (GIS) / OAuth 2.0** | `src/lib/googleAuthGis.ts` (`accounts.google.com/gsi/client`) | Client-side least-privilege OAuth token acquisition (`spreadsheets` + `drive.file`) | GCP `ghost-7b055` -> OAuth Consent Screen + Web OAuth Client `965140210258-...` | Public Client ID (`GHOST_OAUTH_CLIENT_ID` / optional `VITE_GOOGLE_OAUTH_CLIENT_ID`) | Client ID present in code | Verify Authorized JS Origins include `https://focus-flow-by-atif.vercel.app` & `http://localhost:3000`; verify Test Users |
| **Firebase Analytics (GA4)** | `src/lib/firebase.ts` (`getAnalytics`, `isSupported`) | Optional browser usage telemetry | Firebase Console (`focus-flow-by-atif`) -> Analytics | `VITE_FIREBASE_MEASUREMENT_ID=G-H4D8JLHJQJ` | Configured in `.env.local` & `firebase-applet-config.json` | Verify GA4 measurement stream is active in Firebase Console |

---

### Group C — Required by Active Features but NOT Yet Configured

| API / Service | Source-Code Usage | Required Functionality | Cloud / Console Enablement | Credential Requirement | Current Status | Exact Missing Configuration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Firebase Admin SDK (Server-Side Firestore + Auth + Messaging)** | `server/firebaseAdmin.ts`, `server/vaultBackendService.ts`, `server/durableIdempotencyLedger.ts`, `server/integrations/googleCalendarService.ts`, `server/integrations/pushNotificationService.ts` | Dual-Copy durable idempotency ledger (`driveIdempotency`), Joint Vault ACID transactions, Google Calendar token storage, FCM push dispatch | Firebase Console (`focus-flow-by-atif`) -> Service Accounts (use existing valid SA; do not create duplicates) | `FIREBASE_SERVICE_ACCOUNT_JSON` **AND** `FIREBASE_SERVICE_ACCOUNT_KEY` (same single-line JSON) | **Missing** in `.env.local` and repo | Add single-line Service Account JSON to Vercel Production under **both** `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_SERVICE_ACCOUNT_KEY` (Secret) |
| **Google Calendar API (v3)** | `server/integrations/googleCalendarService.ts`, `server/routes/googleCalendarRoutes.ts`, `server/routes/googleCalendarOAuthCallback.ts`, `src/lib/googleCalendarService.ts` | OAuth code exchange, encrypted refresh-token storage, list/create/update/delete FocusFlow-managed events, task sync | Enable **Google Calendar API** in `ghost-7b055` + add Authorized Redirect URI | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `INTEGRATION_ENCRYPTION_KEY` | Client ID defaults to `ghost-7b055`; **Client Secret & Encryption Key missing** | Add `GOOGLE_CALENDAR_CLIENT_SECRET` (Secret), `INTEGRATION_ENCRYPTION_KEY` (Secret), and register `https://focus-flow-by-atif.vercel.app/api/integrations/google-calendar/oauth/callback` in GCP OAuth Client |
| **Firebase Cloud Messaging (FCM Web Push + HTTP v1)** | `src/lib/pushNotifications.ts`, `public/sw.js`, `server/routes/pushRoutes.ts`, `server/routes/cronNotificationRoutes.ts`, `server/integrations/pushNotificationService.ts` | Browser push registration (`getToken`), foreground/background notifications, daily scheduled reminders via Vercel Cron | Enable **Firebase Cloud Messaging API (V1)** in `focus-flow-by-atif` + generate Web Push Certificate | `VITE_FIREBASE_VAPID_KEY` (Config), `FIREBASE_SERVICE_ACCOUNT_JSON` (Secret), `CRON_SECRET` (Secret) | **Missing** `VITE_FIREBASE_VAPID_KEY`, `CRON_SECRET`, and Service Account | Copy Web Push key pair from Firebase Console -> Cloud Messaging into `VITE_FIREBASE_VAPID_KEY`; generate `CRON_SECRET` |

---

### Group D — Optional APIs (Implemented as Optional or Planned)

| API / Service | Source-Code Usage | Required Functionality | Cloud / Console Enablement | Credential Requirement | Current Status | Exact Missing Configuration |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Apps Script Web App Bridge** | `server/appsScriptBridgeWorker.ts`, `server/routes.ts` (`/api/sheet-hub/apps-script-writeback`), `scripts/appsScript/` | Optional HMAC-signed server-to-Apps-Script write-back for allowlisted spreadsheets | Deploy `scripts/appsScript` as Web App (`Execute as: Me`, `Access: Anyone`) | `APPS_SCRIPT_WEBAPP_URL`, `APPS_SCRIPT_WEBHOOK_SECRET`, `APPS_SCRIPT_ALLOWLISTED_SPREADSHEETS` | Not configured (optional) | Only configure if you actively use the Apps Script bridge instead of direct Sheets API write-back |
| **Firebase Storage** | `storage.rules`, `firebase.json`, `VITE_FIREBASE_STORAGE_BUCKET` | Future user file/PDF/image uploads (`/users/{userId}/**`) | Firebase Console (`focus-flow-by-atif`) -> Storage | `VITE_FIREBASE_STORAGE_BUCKET` (already set) | Bucket configured & rules written, **SDK (`firebase/storage`) not imported anywhere in code** | No additional API key needed; implement `firebase/storage` client calls only when adding file uploads |
| **Firebase App Check** | `firebase-applet-config.json` (`"recaptchaSiteKey": ""`) | Optional future bot/abuse protection for Firestore/Auth | Firebase Console -> App Check (reCAPTCHA v3 / Enterprise) | None currently | Unused placeholder only | Skip unless enabling App Check enforcement |

---

### Group E — Unused, Redundant, or Obsolete APIs (Do NOT Configure)

| API / Key / Service | Evidence in Repository | Why It Must NOT Be Configured |
| :--- | :--- | :--- |
| **Legacy `FCM_SERVER_KEY`** | Present in `.env.local` and dead getter in `src/lib/googleAuthGis.ts:244` | Legacy FCM protocol is deprecated by Google; `server/integrations/pushNotificationService.ts` uses Firebase Admin SDK HTTP v1 (`getAdminMessaging()`). |
| **`VITE_FIREBASE_MESSAGING_API_KEY`** | Defined in `.env.local` & `src/lib/googleAuthGis.ts:238` (`getFirebaseMessagingApiKey`) | **Never called in runtime app code** (only referenced in `test/api_keys_configuration.test.ts`). FCM Web SDK uses `VITE_FIREBASE_API_KEY` + `VITE_FIREBASE_VAPID_KEY`. |
| **`VITE_GOOGLE_CALENDAR_API_KEY`** | Defined in `.env.local` & `src/lib/googleAuthGis.ts:199` (`getGoogleCalendarApiKey`) | **Never called in runtime app code** (only referenced in `test/api_keys_configuration.test.ts`). Calendar API calls run server-side with OAuth Bearer tokens. |
| **`VITE_GOOGLE_SHEETS_API_KEY`** (duplicate) | Fallback in `src/lib/googleAuthGis.ts:165` | Redundant when `VITE_GOOGLE_PICKER_API_KEY` is already set (exact same key). |
| **Firebase Hosting** | `firebase.json` hosting block | App is deployed on **Vercel** (`focus-flow-by-atif.vercel.app`); Firebase Hosting is redundant. |
| **Firebase Remote Config** | Zero references | Not used anywhere in the application. |
| **AI / Payment / Email / SMS / Weather / FX / Sentry / People APIs** | Zero references across `package.json`, `src/`, `server/`, `api/` | Not used anywhere in FocusFlow & Finance v1.7.0 (and app follows a zero-AI deterministic design). |

---

## 3. Google Integration Deep Audit (Phase 5)

### 3.1 Google Sheets & Drive (`ghost-7b055` + `focus-flow-by-atif`)
- **API Key**: `VITE_GOOGLE_PICKER_API_KEY` (used strictly by `GoogleSheetPickerModal.tsx` for Google Picker `setDeveloperKey`).
- **OAuth Client ID**: `GHOST_OAUTH_CLIENT_ID` (`965140210258-guv9k6akjnfc57c0vffusm4lokhcrvkc.apps.googleusercontent.com`) in `src/lib/googleAuthGis.ts`, overridable via `VITE_GOOGLE_OAUTH_CLIENT_ID`.
- **Project Number**: `VITE_GOOGLE_PROJECT_NUMBER=965140210258` (used as Picker `setAppId`).
- **Scopes (Least-Privilege Verified)**:
  - Read-Only Sheet Hub: `https://www.googleapis.com/auth/spreadsheets.readonly`
  - Two-Way Write-Back: `https://www.googleapis.com/auth/spreadsheets`
  - Dual-Copy / Picker: `https://www.googleapis.com/auth/spreadsheets` + `https://www.googleapis.com/auth/drive.file` (strictly per-file, never broad `drive` scope).
- **Important Dual-Project Note**: The green Dual-Copy & Picker flows use `ghost-7b055` GIS OAuth, whereas the white "Authorize Two-Way Checkbox Write-Back" and "Authorize Read-Only Access" buttons use Firebase Auth (`focus-flow-by-atif.firebaseapp.com`). Ensure **Google Sheets API** is enabled in **both** projects, or route all Sheets OAuth through `ghost-7b055`.

### 3.2 Google Calendar (`ghost-7b055`)
- **OAuth Client ID**: `GOOGLE_CALENDAR_CLIENT_ID` (defaults to `GHOST_OAUTH_CLIENT_ID`).
- **OAuth Client Secret**: `GOOGLE_CALENDAR_CLIENT_SECRET` (**Missing** — required in `server/integrations/googleCalendarService.ts:162,344` for code exchange and refresh-token renewal).
- **Redirect URI**: `GOOGLE_CALENDAR_REDIRECT_URI` defaults to `${APP_URL}/api/integrations/google-calendar/oauth/callback` (`https://focus-flow-by-atif.vercel.app/api/integrations/google-calendar/oauth/callback`).
- **Scope**: `https://www.googleapis.com/auth/calendar.events` (least-privilege; gracefully falls back to `primary` calendar when `calendarList` returns 403).
- **Token Refresh & Encryption**: Automatic refresh when `< 60s` remaining; tokens encrypted at rest via AES-256-GCM (`server/crypto.ts`) using `INTEGRATION_ENCRYPTION_KEY` (**Missing** in production).

### 3.3 Firebase Cloud Messaging (`focus-flow-by-atif`)
- **VAPID Public Key**: `VITE_FIREBASE_VAPID_KEY` (**Missing** — read in `src/lib/pushNotifications.ts:27`).
- **Service Worker**: `public/sw.js` handles `push` and `notificationclick` events cleanly and excludes `/api/*` and cross-origin requests from caching.
- **Firebase Admin Credentials**: `server/integrations/pushNotificationService.ts` dispatches via `getAdminMessaging().sendEachForMulticast(...)` using `FIREBASE_SERVICE_ACCOUNT_JSON` (**Missing**).
- **Installation / FID Registration**: Stored in Firestore at `users/{uid}/fcm_installations/{installationId}` with automatic stale-token cleanup on `registration-token-not-registered` / `invalid-registration-token`.

---

## 4. Missing Implementations & Bugs (Separate from Missing Credentials — Phase 7)

1. **Service Account Env Var Name Mismatch (`server/firebaseAdmin.ts` vs `server/vaultBackendService.ts`)**:
   - `server/firebaseAdmin.ts:122-123` reads `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_KEY`.
   - `server/vaultBackendService.ts:105-109` (also used by `server/durableIdempotencyLedger.ts:289`) reads `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, `FIREBASE_ADMIN_CREDENTIALS`, or `FIREBASE_SERVICE_ACCOUNT_BASE64` — **it does NOT check `FIREBASE_SERVICE_ACCOUNT_JSON`**.
   - **Immediate Workaround (Zero Code Change)**: Set **`FIREBASE_SERVICE_ACCOUNT_KEY`** (or both `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_SERVICE_ACCOUNT_KEY`) to the same single-line JSON in Vercel Production.
2. **Vercel Serverless Read-Only Filesystem Crash (`server/db.ts:498-525`)**:
   - `export const dbService = new DatabaseService()` runs at module import time when `api/index.ts` loads `server/routes.ts`. On Vercel (`/var/task` is read-only), `fs.mkdirSync('/var/task/data')` and `ensureBaseDefaults()` -> `this.save()` fail with `EROFS`, causing `API Error: 500` on serverless endpoints like `/api/sheet-hub/inspect`.
3. **Cron Notifications & Calendar Task Sync Read Local `dbService` Instead of Firestore**:
   - `server/integrations/pushNotificationService.ts:263` (`processScheduledNotifications`) and `server/integrations/googleCalendarService.ts:681` (`syncTasks`) read `dbService.getRaw()` instead of Cloud Firestore. On Vercel Serverless, `dbService` is ephemeral/empty on cold start, so scheduled push notifications and task-to-calendar sync will see 0 users/tasks for Firestore-backed accounts until migrated to `getAdminFirestore()`.
4. **Undocumented / Non-Existent Cron Endpoint in Docs**:
   - `VERCEL_ENVIRONMENT_VARIABLES.md` references `/api/cron/sheets-sync`, which does not exist in `server/routes/` or `vercel.json` (only `/api/cron/notifications` exists).
5. **Production Encryption Key Fails Open (`server/crypto.ts:21-24`)**:
   - If `INTEGRATION_ENCRYPTION_KEY` is missing in production, `resolveEncryptionKey()` silently uses a hardcoded fallback string instead of throwing an error. Always set a random 64-char hex `INTEGRATION_ENCRYPTION_KEY` in Vercel Production.
6. **CORS Preflight Header Missing in `vercel.json`**:
   - `vercel.json` line 26 `Access-Control-Allow-Headers` omits `x-google-access-token` (required for cross-origin Sheet Hub calls; `server/security.ts` includes it, but `vercel.json` static headers override/duplicate it).
7. **Dead Client API Key Getters & Manifest Placeholders**:
   - `getGoogleCalendarApiKey()` and `getFirebaseMessagingApiKey()` in `src/lib/googleAuthGis.ts` are unused outside tests.
   - `oAuthClientId: ""` and `recaptchaSiteKey: ""` in `firebase-applet-config.json` are never read.

---

## 5. Security Audit Summary (Phase 8)

| Security Check | Status | Details |
| :--- | :--- | :--- |
| No private secrets bundled in frontend (`VITE_*`) | **PASS** | Only public Firebase Web config, Picker API key, Project Number, OAuth Client ID, and VAPID public key use `VITE_`. |
| No private keys / secrets committed to Git | **PASS** | `.env*` (except `.env.example`) is in `.gitignore`; no Service Account JSON or `GOCSPX-` secret exists in Git. |
| OAuth scopes follow least privilege | **PASS** | Uses `spreadsheets.readonly`, `spreadsheets`, `drive.file`, and `calendar.events` (no broad `drive` or `calendar` scope). |
| Preview cannot access Production Firebase | **PASS** | `firebaseConfigResolver.ts`, `server/auth.ts`, and `server/vaultBackendService.ts` all fail closed with `[STAGING_DATA_SAFETY_VIOLATION]` if Preview targets `focus-flow-by-atif` or `(default)`. |
| No legacy FCM Server Key used in backend | **PASS** | Backend uses `firebase-admin/messaging` HTTP v1. Remove `FCM_SERVER_KEY` from `.env.local` to avoid confusion. |
| Firestore tenant isolation | **PASS** | `firestore.rules` enforces `request.auth.uid == userId`; server `auth.ts` verifies RS256 Firebase JWT and rejects spoofed `x-user-id` with HTTP 403. |
| API key restrictions (GCP Console) | **VERIFY** | Restrict `VITE_FIREBASE_API_KEY` and `VITE_GOOGLE_PICKER_API_KEY` by HTTP Referrer (`https://focus-flow-by-atif.vercel.app/*`, `http://localhost:3000/*`) and specific enabled APIs. |
| Production encryption key fail-closed | **ACTION NEEDED** | Set `INTEGRATION_ENCRYPTION_KEY` in Vercel Production immediately so `server/crypto.ts` never uses its hardcoded fallback. |
