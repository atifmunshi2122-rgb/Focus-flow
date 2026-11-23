# FocusFlow & Finance v1.7.0 — Vercel Remaining Environment Variables

This document lists every environment variable required, optional, or prohibited for **FocusFlow & Finance v1.7.0** on Vercel.

---

## 1. Required Production Variables
Configure these under **Environment: Production** in the Vercel Dashboard.

| Config or Secret | Key | Exact Value / Source |
| :--- | :--- | :--- |
| **Config** | `NODE_ENV` | `production` |
| **Config** | `APP_URL` | `https://focus-flow-by-atif.vercel.app` |
| **Config** | `ALLOWED_ORIGINS` | `https://focus-flow-by-atif.vercel.app` |
| **Config** | `REQUIRE_AUTH` | `true` |
| **Config** | `ALLOW_GUEST` | `false` |
| **Config** | `TRUST_PROXY` | `1` |
| **Config** | `FIREBASE_PROJECT_ID` | `focus-flow-by-atif` |
| **Secret** | `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project Settings → Service accounts → Generate new private key. Paste full single-line JSON string. |
| **Secret** | `INTEGRATION_ENCRYPTION_KEY` | Generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| **Secret** | `CRON_SECRET` | Generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| **Config** | `VITE_FIREBASE_API_KEY` | `AIzaSyBYl8FBizO0sOEy7DOrHl1dUtsPixuIdpI` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_AUTH_DOMAIN` | `focus-flow-by-atif.firebaseapp.com` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_PROJECT_ID` | `focus-flow-by-atif` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_STORAGE_BUCKET` | `focus-flow-by-atif.firebasestorage.app` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `1010159085609` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_APP_ID` | `1:1010159085609:web:1d968f8d5359f5a0011438` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_DATABASE_ID` | `(default)` (From `firebase-applet-config.json`) |

---

## 2. Optional Production Variables
Configure these only if you enable the corresponding feature (Google Calendar, Sheet Hub / Picker, Web Push, or Google Apps Script).

| Config or Secret | Key | Exact Value / Source |
| :--- | :--- | :--- |
| **Config** | `GOOGLE_CALENDAR_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Web Client ID. |
| **Secret** | `GOOGLE_CALENDAR_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Web Client Secret. |
| **Config** | `GOOGLE_CALENDAR_REDIRECT_URI` | `https://focus-flow-by-atif.vercel.app/api/integrations/google-calendar/oauth/callback` |
| **Config** | `VITE_GOOGLE_PICKER_API_KEY` | `AIzaSyCw1wOxkYkJPoWcMrX4mc8E8rGxpxZXJMQ` (For Drive Sheet Picker dialog) |
| **Config** | `VITE_GOOGLE_SHEETS_API_KEY` | `AIzaSyCw1wOxkYkJPoWcMrX4mc8E8rGxpxZXJMQ` (For public spreadsheet inspection fallback) |
| **Config** | `VITE_GOOGLE_PROJECT_NUMBER` | `965140210258` (From Google Cloud Project Info) |
| **Config** | `VITE_GOOGLE_CALENDAR_API_KEY` | `AIzaSyDZFq6pp77Kp9zMSKVQSY-wb8xlWCcEcS8` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_VAPID_KEY` | Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Key pair public key. |
| **Config** | `VITE_FIREBASE_MESSAGING_API_KEY` | `AIzaSyC9JOdO981WILoxGBjlIf1-hA-dRKkE0Fk` (From `firebase-applet-config.json`) |
| **Config** | `VITE_FIREBASE_MEASUREMENT_ID` | `G-H4D8JLHJQJ` (Google Analytics 4 Measurement ID) |
| **Config** | `APPS_SCRIPT_WEBAPP_URL` | Deployed Google Apps Script Web App URL (`https://script.google.com/macros/s/.../exec`). |
| **Secret** | `APPS_SCRIPT_WEBHOOK_SECRET` | 32-byte secret matching `FOCUSFLOW_WEBHOOK_SECRET` in `Code.gs`. |
| **Config** | `APPS_SCRIPT_ALLOWLISTED_SPREADSHEETS`| `*` or comma-separated target spreadsheet IDs. |

---

## 3. Preview Variables (Staging Gate)
Configure these under **Environment: Preview** in Vercel **ONLY** if you maintain a dedicated Staging Firebase project.

> [!WARNING]
> If these variables are not configured or if they point to the production project (`focus-flow-by-atif`) or default database (`(default)`), Preview builds intentionally fail closed with `[STAGING_DATA_SAFETY_VIOLATION]` to protect production data.

| Config or Secret | Key | Exact Value / Source |
| :--- | :--- | :--- |
| **Config** | `NODE_ENV` | `production` |
| **Config** | `APP_URL` | `https://focusflow-preview.vercel.app` (or your preview domain) |
| **Config** | `ALLOWED_ORIGINS` | `https://focusflow-preview.vercel.app` |
| **Config** | `REQUIRE_AUTH` | `true` |
| **Config** | `ALLOW_GUEST` | `false` |
| **Config** | `TRUST_PROXY` | `1` |
| **Config** | `VITE_APP_ENV` | `preview` |
| **Config** | `FIREBASE_PROJECT_ID` | `your-dedicated-staging-project-id` (MUST NOT be `focus-flow-by-atif`) |
| **Secret** | `FIREBASE_SERVICE_ACCOUNT_JSON` | Staging Firebase project service account JSON string. |
| **Secret** | `INTEGRATION_ENCRYPTION_KEY` | Separate 32-byte hex encryption key for staging tokens. |
| **Config** | `VITE_FIREBASE_API_KEY` | Staging Firebase Web API key |
| **Config** | `VITE_FIREBASE_AUTH_DOMAIN` | `your-staging-project.firebaseapp.com` |
| **Config** | `VITE_FIREBASE_PROJECT_ID` | `your-dedicated-staging-project-id` |
| **Config** | `VITE_FIREBASE_STORAGE_BUCKET` | `your-staging-project.firebasestorage.app` |
| **Config** | `VITE_FIREBASE_DATABASE_ID` | `staging-db` (MUST NOT be `(default)`) |

---

## 4. Third-Party API Credentials
An audit of all dependencies and network requests confirms: **NO THIRD-PARTY API CREDENTIALS ARE REQUIRED.**

| Config or Secret | Key | Exact Value / Source |
| :--- | :--- | :--- |
| **N/A** | `GEMINI_API_KEY` | **NOT USED** — Application does not use Gemini AI. |
| **N/A** | `OPENAI_API_KEY` | **NOT USED** — Application does not use OpenAI. |
| **N/A** | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | **NOT USED** — Application has no payment gateway. |
| **N/A** | `STRIPE_API_KEY` / `STRIPE_SECRET_KEY` | **NOT USED** — Application has no Stripe billing. |
| **N/A** | `EXCHANGE_RATE_API_KEY` | **NOT USED** — No currency conversion API calls. |
| **N/A** | `SENTRY_DSN` | **NOT USED** — Application uses internal Express/React error boundaries. |
| **N/A** | `SENDGRID_API_KEY` / `TWILIO_AUTH_TOKEN` | **NOT USED** — Application uses browser FCM push notifications. |

---

## 5. Secrets Generated Locally
Generate these secrets on your local machine using Node.js before adding them to Vercel:

| Config or Secret | Key | Exact Value / Source |
| :--- | :--- | :--- |
| **Secret** | `INTEGRATION_ENCRYPTION_KEY` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| **Secret** | `CRON_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| **Secret** | `APPS_SCRIPT_WEBHOOK_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

---

## 6. Variables That Must NOT Be Added to Vercel
Do not add these variables to Vercel as they cause deployment conflicts, expose credentials, or are obsolete.

| Config or Secret | Key | Exact Value / Source |
| :--- | :--- | :--- |
| **Prohibited** | `VERCEL`, `VERCEL_ENV`, `VERCEL_URL` | Injected automatically by Vercel platform runtime. |
| **Prohibited** | `PORT` | Managed automatically by Vercel Serverless router. |
| **Prohibited** | `DATA_DIR` | Vercel filesystem is read-only. Serverless fallback automatically routes to `/tmp/focusflow-data`. |
| **Prohibited** | `FCM_SERVER_KEY` | Deprecated legacy FCM server key. FocusFlow uses Firebase Admin HTTP v1. |
| **Prohibited** | `FIREBASE_SERVICE_ACCOUNT_KEY` | File path reference; service account files must not be committed to Git. |
| **Prohibited** | `GOOGLE_APPLICATION_CREDENTIALS` | Local file path reference. Use `FIREBASE_SERVICE_ACCOUNT_JSON` on Vercel. |

