# FocusFlow & Finance v1.7.0 — API Enablement & Cloud Console Checklist

This document is the official checklist for Google Cloud Console and Firebase Console configuration for **FocusFlow & Finance v1.7.0**.

---

## 1. Google Cloud Console API Enablement Checklist

**Target Project:** `focus-flow-by-atif` (Project Number: `1010159085609`)  
*(Optional Picker Project: `ghost-7b055` / `965140210258`)*

| Console | API / Service | Required? | Purpose | Configuration Status | Enablement URL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Cloud** | **Google Sheets API** | **YES** | Read metadata, inspect sheets, and write back updated rows. | Must be Enabled | [Enable Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Google Drive API** | **YES** | Duplicate templates in Dual-Copy mode and check file metadata. | Must be Enabled | [Enable Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Google Calendar API** | **YES** *(if using Calendar)* | Fetch calendars, read events, and sync task deadlines. | Must be Enabled | [Enable Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Google Picker API** | **YES** *(if using Sheet Picker)* | Render interactive Drive sheet picker popup. | Must be Enabled | [Enable Picker API](https://console.cloud.google.com/apis/library/picker.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Cloud Firestore API** | **YES** | Authoritative database for users, habits, vaults, tasks, and sync. | Must be Enabled | [Enable Firestore API](https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Identity Toolkit API** | **YES** | Underlying Google Cloud engine for Firebase Authentication. | Must be Enabled | [Enable Identity Toolkit](https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Firebase Cloud Messaging API** | **YES** *(if using Push)* | HTTP v1 multicast web push notifications. | Must be Enabled | [Enable FCM API](https://console.cloud.google.com/apis/library/fcm.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Token Service API** | **YES** | Automatic token issuance and security token verification. | Auto-Enabled with Auth | [Token Service API](https://console.cloud.google.com/apis/library/securetoken.googleapis.com?project=focus-flow-by-atif) |
| **Google Cloud** | **Google Apps Script API** | Optional | Only needed if programmatically updating script projects. | Optional | [Apps Script API](https://console.cloud.google.com/apis/library/script.googleapis.com?project=focus-flow-by-atif) |

---

## 2. Firebase Console Configuration Checklist

**Target Project:** `focus-flow-by-atif`

| Console | Component / Feature | Required? | Purpose | Configuration Status | Direct URL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Firebase** | **Email/Password Auth** | **YES** | Direct user authentication | **Active** | [Firebase Auth Providers](https://console.firebase.google.com/project/focus-flow-by-atif/authentication/providers) |
| **Firebase** | **Google Sign-In Auth** | **YES** | Single sign-on with Google account | **Active** | [Firebase Auth Providers](https://console.firebase.google.com/project/focus-flow-by-atif/authentication/providers) |
| **Firebase** | **Authorized Domains** | **YES** | Prevent unauthorized OAuth redirects | Must verify domains | [Auth Settings](https://console.firebase.google.com/project/focus-flow-by-atif/authentication/settings) |
| **Firebase** | **Cloud Firestore** | **YES** | Production database instance `(default)` | **Active** | [Firestore Studio](https://console.firebase.google.com/project/focus-flow-by-atif/firestore) |
| **Firebase** | **Firestore Security Rules** | **YES** | Enforce multi-tenant user isolation | Deployed from `firestore.rules` | [Firestore Rules](https://console.firebase.google.com/project/focus-flow-by-atif/firestore/rules) |
| **Firebase** | **Firestore Indexes** | **YES** | Composite query support | Deployed from `firestore.indexes.json` | [Firestore Indexes](https://console.firebase.google.com/project/focus-flow-by-atif/firestore/indexes) |
| **Firebase** | **Web Push Certificates** | **YES** *(for Push)* | VAPID key generation for Web Push | **Action Needed** | [FCM Web Configuration](https://console.firebase.google.com/project/focus-flow-by-atif/settings/cloudmessaging) |
| **Firebase** | **Service Accounts** | **YES** | Private key for Firebase Admin SDK | **Action Needed** | [Service Accounts](https://console.firebase.google.com/project/focus-flow-by-atif/settings/serviceaccounts/adminsdk) |
| **Firebase** | **Cloud Storage** | Optional | Future attachment uploads | Rules deployed (`storage.rules`) | [Storage](https://console.firebase.google.com/project/focus-flow-by-atif/storage) |

---

## 3. Google OAuth 2.0 Credentials & Consent Screen

### 3.1 OAuth Consent Screen Setup
Navigate to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=focus-flow-by-atif):
1. **User Type**: External (or Internal if Google Workspace organization).
2. **App Name**: `FocusFlow & Finance`
3. **User Support Email**: `atifmunshi2122@gmail.com`
4. **Developer Contact Email**: `atifmunshi2122@gmail.com`
5. **Scopes**:
   - `openid`, `email`, `profile` (Firebase Auth)
   - `https://www.googleapis.com/auth/calendar.events` (Google Calendar)
   - `https://www.googleapis.com/auth/spreadsheets.readonly` (Sheet Hub Read-Only)
   - `https://www.googleapis.com/auth/spreadsheets` (Sheet Hub Write-Back)
   - `https://www.googleapis.com/auth/drive.file` (Dual-Copy template cloning)
6. **Publishing Status**:
   - For Personal / Testing: Keep in **Testing** status and add your email to **Test users**.
   - For Public Launch: Submit for Google OAuth Verification.

### 3.2 Web OAuth 2.0 Client ID Setup
Navigate to [Credentials](https://console.cloud.google.com/apis/credentials?project=focus-flow-by-atif):
1. Create **OAuth Client ID** → Application type: **Web application**.
2. **Name**: `FocusFlow Web Client`
3. **Authorized JavaScript origins**:
   - `https://focus-flow-by-atif.vercel.app`
   - `https://focus-flow-by-atif.firebaseapp.com`
   - `http://localhost:3000`
   - `http://localhost:5173`
4. **Authorized redirect URIs**:
   - `https://focus-flow-by-atif.vercel.app/api/integrations/google-calendar/oauth/callback`
   - `https://focus-flow-by-atif.firebaseapp.com/__/auth/handler`
   - `http://localhost:3000/api/integrations/google-calendar/oauth/callback`
5. Copy the generated **Client ID** and **Client Secret** into Vercel variables `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`.

---

## 4. Firebase Cloud Messaging (Web Push) Setup
1. Go to [Cloud Messaging Settings](https://console.firebase.google.com/project/focus-flow-by-atif/settings/cloudmessaging).
2. Scroll to **Web configuration** → **Web Push certificates**.
3. Click **Generate key pair**.
4. Copy the generated public key string.
5. In Vercel, assign this string to `VITE_FIREBASE_VAPID_KEY` (Production environment).

---

## 5. Firebase Admin Service Account Key Setup
1. Go to [Firebase Service Accounts](https://console.firebase.google.com/project/focus-flow-by-atif/settings/serviceaccounts/adminsdk).
2. Click **Generate new private key** → **Generate key**.
3. Open the downloaded `.json` file and convert to a single-line string:
   ```bash
   cat serviceAccountKey.json | tr -d '\n'
   ```
4. In Vercel, add this string under `FIREBASE_SERVICE_ACCOUNT_JSON` with type **Sensitive**.

