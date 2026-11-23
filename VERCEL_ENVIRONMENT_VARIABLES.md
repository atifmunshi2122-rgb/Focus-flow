# FocusFlow & Finance v1.7.0 — Vercel Environment Variables Master Guide

This document is the authoritative, verified reference for all environment variables used by **FocusFlow & Finance v1.7.0**. Every variable listed here has been audited directly against the source code (`server/`, `src/`, `api/`, and configuration manifests).

---

## 1. Architecture & Security Overview

### 1.1 Client (`VITE_*`) vs Server (`process.env.*`)
* **Client Variables (`VITE_*`)**: Embedded into the client JavaScript bundle at build time by Vite. **Visible to anyone inspecting the browser source code or network traffic.**
  * Must contain **ONLY** public identifiers (Firebase API keys, OAuth Client IDs, Project Numbers, Auth Domains, VAPID public keys).
  * **NEVER** prefix private keys, secrets, or encryption keys with `VITE_`.
* **Server Variables (`process.env.*`)**: Runtime serverless environment variables used exclusively in Vercel Serverless Functions (`api/index.ts`, `server/`).
  * In Vercel, store sensitive credentials (`FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`, `APPS_SCRIPT_WEBHOOK_SECRET`) as **Sensitive / Secret** environment variables.
  * These values are never bundled into client assets.

### 1.2 Environment Tiers & Isolation Rules
FocusFlow & Finance enforces strict tier isolation through `src/lib/firebaseConfigResolver.ts`:
1. **Production (`VERCEL_ENV=production`)**:
   - Production domain: `https://focus-flow-by-atif.vercel.app`
   - Production Firebase project: `focus-flow-by-atif`
   - Production Firestore database: `(default)`
2. **Preview (`VERCEL_ENV=preview`)**:
   - Automatically detected on PR previews and branch deployments (`*.vercel.app`).
   - **STAGING GATE ENFORCED**: Preview environments strictly require a **dedicated Staging Firebase project and database**.
   - If Preview points to `focus-flow-by-atif` or database `(default)`, the resolver throws `[STAGING_DATA_SAFETY_VIOLATION]` to protect production data from contamination.
   - If staging variables are missing, the build fails closed with `[PREVIEW_STAGING_CONFIG_MISSING]`.
   - **If you do not maintain a separate Staging Firebase project, DO NOT deploy Preview environments.**
3. **Development (`NODE_ENV=development` / local)**:
   - Configured locally via `.env.local`. Never commit `.env.local` to git.

---

## 2. Master Vercel Environment Variable Reference Table

| Variable Key | Scope / Type | Environment | Required? | Default / Production Value | Purpose & Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`NODE_ENV`** | Server / Plain | Production, Preview | **Required** | `production` | Node.js execution environment mode. |
| **`APP_URL`** | Server / Plain | Production, Preview | **Required** | `https://focus-flow-by-atif.vercel.app` | Canonical app origin. Used for CORS validation, webhooks, and OAuth redirects. |
| **`ALLOWED_ORIGINS`** | Server / Plain | Production, Preview | **Required** | `https://focus-flow-by-atif.vercel.app` | Comma-separated list of trusted origins for CORS and CSRF origin validation. |
| **`REQUIRE_AUTH`** | Server / Plain | Production, Preview | **Required** | `true` | Enforces Firebase ID token verification on protected API endpoints. |
| **`ALLOW_GUEST`** | Server / Plain | Production, Preview | **Required** | `false` | Disables unauthenticated guest bypass in production. |
| **`TRUST_PROXY`** | Server / Plain | Production, Preview | **Required** | `1` | Configures Express `trust proxy` for Vercel edge reverse proxy (rate limiting). |
| **`FIREBASE_PROJECT_ID`** | Server / Plain | Production | **Required** | `focus-flow-by-atif` | Firebase project ID used by Admin SDK token verification. |
| **`FIREBASE_SERVICE_ACCOUNT_JSON`** | Server / **Secret** | Production | **Required** | *[Raw single-line JSON string]* | Full service account credential JSON for Firebase Admin SDK & FCM HTTP v1. |
| **`INTEGRATION_ENCRYPTION_KEY`** | Server / **Secret** | Production, Preview | **Required** | *[32-byte hex string]* | AES-256-GCM encryption key for user OAuth refresh tokens at rest. |
| **`CRON_SECRET`** | Server / **Secret** | Production | **Required** | *[Random 32-byte token]* | Bearer secret for Vercel Cron endpoints (`/api/cron/notifications`, `/api/cron/sheets-sync`). |
| **`GOOGLE_CALENDAR_CLIENT_ID`** | Server / Plain | Production | **Required** *(if using Calendar)* | `...apps.googleusercontent.com` | Google OAuth 2.0 Web Client ID for Calendar token exchange. |
| **`GOOGLE_CALENDAR_CLIENT_SECRET`**| Server / **Secret** | Production | **Required** *(if using Calendar)* | `GOCSPX-...` | Google OAuth 2.0 Web Client Secret for Calendar token exchange. |
| **`GOOGLE_CALENDAR_REDIRECT_URI`** | Server / Plain | Production | Optional | `https://focus-flow-by-atif.vercel.app/api/integrations/google-calendar/oauth/callback` | Explicit redirect URI (falls back to `${APP_URL}/api/integrations/google-calendar/oauth/callback`). |
| **`VITE_FIREBASE_API_KEY`** | Client / Plain | Production | **Required** | `AIzaSyBYl8FBizO0sOEy7DOrHl1dUtsPixuIdpI` | Firebase Web API key for client authentication. |
| **`VITE_FIREBASE_AUTH_DOMAIN`** | Client / Plain | Production | **Required** | `focus-flow-by-atif.firebaseapp.com` | Firebase Auth domain for login and redirect handlers. |
| **`VITE_FIREBASE_PROJECT_ID`** | Client / Plain | Production | **Required** | `focus-flow-by-atif` | Firebase Project ID for Firestore and client initialization. |
| **`VITE_FIREBASE_STORAGE_BUCKET`**| Client / Plain | Production | **Required** | `focus-flow-by-atif.firebasestorage.app` | Default Cloud Storage bucket for user attachments. |
| **`VITE_FIREBASE_MESSAGING_SENDER_ID`** | Client / Plain | Production | **Required** | `1010159085609` | Google Cloud project sender ID for FCM push messages. |
| **`VITE_FIREBASE_APP_ID`** | Client / Plain | Production | **Required** | `1:1010159085609:web:1d968f8d5359f5a0011438` | Firebase Web App registration ID. |
| **`VITE_FIREBASE_MEASUREMENT_ID`** | Client / Plain | Production | Optional | `G-H4D8JLHJQJ` | Google Analytics 4 measurement ID for web telemetry. |
| **`VITE_FIREBASE_DATABASE_ID`** | Client / Plain | Production | **Required** | `(default)` | Firestore database instance ID for production. |
| **`VITE_GOOGLE_PICKER_API_KEY`** | Client / Plain | Production | **Required** *(if using Sheet Picker)* | `AIzaSyCw1wOxkYkJPoWcMrX4mc8E8rGxpxZXJMQ` | Google API key with Google Picker API and Sheets API enabled. |
| **`VITE_GOOGLE_SHEETS_API_KEY`** | Client / Plain | Production | **Required** *(if using Sheet Hub)* | `AIzaSyCw1wOxkYkJPoWcMrX4mc8E8rGxpxZXJMQ` | Fallback API key for public spreadsheet inspect queries. |
| **`VITE_GOOGLE_PROJECT_NUMBER`** | Client / Plain | Production | **Required** *(if using Sheet Picker)* | `965140210258` | Google Cloud project number for Drive Picker authorization. |
| **`VITE_GOOGLE_CALENDAR_API_KEY`**| Client / Plain | Production | Optional | `AIzaSyDZFq6pp77Kp9zMSKVQSY-wb8xlWCcEcS8` | Client-side Google Calendar API key. |
| **`VITE_FIREBASE_VAPID_KEY`** | Client / Plain | Production | **Required** *(if using Push Notifications)* | *[Web Push Certificate Public Key]* | VAPID public key from Firebase Console -> Cloud Messaging. |
| **`VITE_FIREBASE_MESSAGING_API_KEY`** | Client / Plain | Production | Optional | `AIzaSyC9JOdO981WILoxGBjlIf1-hA-dRKkE0Fk` | Dedicated API key for Firebase Cloud Messaging web client. |
| **`APPS_SCRIPT_WEBAPP_URL`** | Server / Plain | Production | Optional | `https://script.google.com/macros/s/.../exec` | Deployed Google Apps Script Web App URL for server write-back. |
| **`APPS_SCRIPT_WEBHOOK_SECRET`** | Server / **Secret** | Production | Optional *(Required if using Apps Script)* | *[32-byte hex/base64 token]* | Shared HMAC-SHA256 signature secret matching `Code.gs`. |
| **`APPS_SCRIPT_ALLOWLISTED_SPREADSHEETS`** | Server / Plain | Production | Optional | `*` or comma-separated Sheet IDs | Authorized target spreadsheets for Apps Script write-back. |

---

## 3. Detailed Service Configuration Guides

### 3.1 Firebase Admin SDK (`server/firebaseAdmin.ts`)
* **Primary Key**: `FIREBASE_SERVICE_ACCOUNT_JSON`
* **Vercel Type**: **Sensitive / Secret**
* **Environment**: Production
* **Format**: A single-line JSON string containing the full service account key.
* **How to Obtain**:
  1. Go to [Firebase Console](https://console.firebase.google.com/) -> Select `focus-flow-by-atif`.
  2. Click **Project Settings** (gear icon) -> **Service accounts** tab.
  3. Click **Generate new private key** -> Click **Generate key**.
  4. Convert the downloaded JSON file into a single line:
     ```bash
     cat serviceAccountKey.json | tr -d '\n'
     ```
  5. In Vercel Dashboard, paste the single-line string into `FIREBASE_SERVICE_ACCOUNT_JSON`.
* **Project Mismatch Protection**:
  `server/firebaseAdmin.ts` validates that the `project_id` inside `FIREBASE_SERVICE_ACCOUNT_JSON` matches `focus-flow-by-atif`. Providing credentials from another GCP project throws `[FIREBASE_CREDENTIAL_PROJECT_MISMATCH]` and fails closed.

### 3.2 Security Encryption Keys & Cron Secret
Run these shell commands to generate secure keys for Vercel:

1. **`INTEGRATION_ENCRYPTION_KEY`** (32-byte hex key for AES-256-GCM token encryption):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Example: a7b3c2... (64 hex characters)
   ```
2. **`CRON_SECRET`** (Used to authenticate Vercel Cron jobs):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. **`APPS_SCRIPT_WEBHOOK_SECRET`** (Shared secret with Google Apps Script `Code.gs`):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### 3.3 Google Calendar Integration
* **`GOOGLE_CALENDAR_CLIENT_ID`** & **`GOOGLE_CALENDAR_CLIENT_SECRET`**:
  1. Open [Google Cloud Console](https://console.cloud.google.com/) -> APIs & Services -> Credentials.
  2. Create an **OAuth 2.0 Client ID** of type **Web application**.
  3. Under **Authorized redirect URIs**, add:
     - `https://focus-flow-by-atif.vercel.app/api/integrations/google-calendar/oauth/callback`
     - `http://localhost:3000/api/integrations/google-calendar/oauth/callback` (for local dev)
  4. Copy Client ID and Client Secret into Vercel environment variables.

### 3.4 Firebase Cloud Messaging (Web Push)
* **`VITE_FIREBASE_VAPID_KEY`**:
  1. Open [Firebase Console](https://console.firebase.google.com/) -> Select `focus-flow-by-atif`.
  2. Navigate to **Project Settings** -> **Cloud Messaging** tab.
  3. Scroll down to **Web configuration** -> **Web Push certificates**.
  4. If no key pair exists, click **Generate key pair**.
  5. Copy the public **Key pair** string into `VITE_FIREBASE_VAPID_KEY`.

---

## 4. Preview Scope (Staging Isolation Gate)

> [!WARNING]
> **PREVIEW ENVIRONMENT SAFETY NOTICE**
> `src/lib/firebaseConfigResolver.ts` enforces strict staging isolation. If a preview build detects `focus-flow-by-atif` or database `(default)`, it aborts with `[STAGING_DATA_SAFETY_VIOLATION]`.

If you wish to enable Preview deployments for pull requests:
1. Create a separate Firebase project (e.g., `focus-flow-staging`).
2. Create a separate Firestore database or use a non-default database ID (e.g., `staging-db`).
3. In Vercel Dashboard -> Environment Variables -> add these with **Environment: Preview**:

```ini
NODE_ENV="production"
APP_URL="https://focusflow-preview.vercel.app"
ALLOWED_ORIGINS="https://focusflow-preview.vercel.app"
REQUIRE_AUTH="true"
ALLOW_GUEST="false"
VITE_APP_ENV="preview"
FIREBASE_PROJECT_ID="focus-flow-staging"
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"focus-flow-staging",...}'
VITE_FIREBASE_API_KEY="AIzaSyStagingKey..."
VITE_FIREBASE_AUTH_DOMAIN="focus-flow-staging.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="focus-flow-staging"
VITE_FIREBASE_STORAGE_BUCKET="focus-flow-staging.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-staging-sender-id"
VITE_FIREBASE_APP_ID="1:staging:web:appid"
VITE_FIREBASE_DATABASE_ID="staging-db"
INTEGRATION_ENCRYPTION_KEY="your-staging-32-byte-hex-key"
```

*If you do not have a dedicated Staging Firebase project, leave Preview environment variables unconfigured.*

---

## 5. Variables That Must NOT Be Added to Vercel (Obsolete / Automatic)

Do **NOT** add the following to Vercel:
1. **`VERCEL`, `VERCEL_ENV`, `VERCEL_URL`**: Vercel injects these automatically at build and runtime.
2. **`PORT`**: Vercel Serverless handles incoming HTTP requests directly via `api/index.ts`.
3. **`DATA_DIR`**: Vercel filesystem is read-only except ephemeral `/tmp`. Local JSON persistence defaults to `/tmp/focusflow-data` in serverless fallback mode.
4. **`FCM_SERVER_KEY`**: Legacy FCM API server key. FocusFlow uses Firebase Admin HTTP v1 via `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. **`FIREBASE_SERVICE_ACCOUNT_KEY`** (file path): Not supported in Vercel serverless since credential files should not be committed to Git. Use `FIREBASE_SERVICE_ACCOUNT_JSON` instead.
6. **`GOOGLE_APPLICATION_CREDENTIALS`**: Standard GCP file-path variable. Use `FIREBASE_SERVICE_ACCOUNT_JSON` on Vercel.

---

## 6. Vercel CLI Quick Setup Commands

You can configure these variables using the Vercel CLI:

```bash
# 1. Core Server Settings
vercel env add NODE_ENV production production
vercel env add APP_URL production production
# Enter: https://focus-flow-by-atif.vercel.app

vercel env add ALLOWED_ORIGINS production production
# Enter: https://focus-flow-by-atif.vercel.app

vercel env add REQUIRE_AUTH production production
# Enter: true

vercel env add ALLOW_GUEST production production
# Enter: false

vercel env add TRUST_PROXY production production
# Enter: 1

vercel env add FIREBASE_PROJECT_ID production production
# Enter: focus-flow-by-atif

# 2. Server Secrets (Encrypted / Sensitive)
vercel env add FIREBASE_SERVICE_ACCOUNT_JSON production sensitive
vercel env add INTEGRATION_ENCRYPTION_KEY production sensitive
vercel env add CRON_SECRET production sensitive
vercel env add GOOGLE_CALENDAR_CLIENT_ID production sensitive
vercel env add GOOGLE_CALENDAR_CLIENT_SECRET production sensitive

# 3. Client Frontend Web SDK (Production)
vercel env add VITE_FIREBASE_API_KEY production production
# Enter: AIzaSyBYl8FBizO0sOEy7DOrHl1dUtsPixuIdpI

vercel env add VITE_FIREBASE_AUTH_DOMAIN production production
# Enter: focus-flow-by-atif.firebaseapp.com

vercel env add VITE_FIREBASE_PROJECT_ID production production
# Enter: focus-flow-by-atif

vercel env add VITE_FIREBASE_STORAGE_BUCKET production production
# Enter: focus-flow-by-atif.firebasestorage.app

vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID production production
# Enter: 1010159085609

vercel env add VITE_FIREBASE_APP_ID production production
# Enter: 1:1010159085609:web:1d968f8d5359f5a0011438

vercel env add VITE_FIREBASE_MEASUREMENT_ID production production
# Enter: G-H4D8JLHJQJ

vercel env add VITE_FIREBASE_DATABASE_ID production production
# Enter: (default)

# 4. Google APIs & Drive Picker
vercel env add VITE_GOOGLE_PICKER_API_KEY production production
# Enter: AIzaSyCw1wOxkYkJPoWcMrX4mc8E8rGxpxZXJMQ

vercel env add VITE_GOOGLE_SHEETS_API_KEY production production
# Enter: AIzaSyCw1wOxkYkJPoWcMrX4mc8E8rGxpxZXJMQ

vercel env add VITE_GOOGLE_PROJECT_NUMBER production production
# Enter: 965140210258

vercel env add VITE_GOOGLE_CALENDAR_API_KEY production production
# Enter: AIzaSyDZFq6pp77Kp9zMSKVQSY-wb8xlWCcEcS8

vercel env add VITE_FIREBASE_VAPID_KEY production production
# Enter your Web Push Certificate Public Key from Firebase Console
```

