# FocusFlow & Finance — Firebase Production Setup Guide

This guide details the exact steps required to provision, configure, and secure the production Firebase project for FocusFlow & Finance.

---

## 1. Project Creation & Plan Selection

1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new Firebase project (e.g., `focusflow-production`).
3. **Upgrade to the Blaze (Pay as you go) plan:**
   - Required to access external Google APIs (Google Sheets & Drive APIs) from Cloud Functions or container runtimes.
   - Set up Google Cloud budget alerts (e.g., $10/month threshold) to prevent runaway billing.

---

## 2. Firebase Authentication Configuration

### 2.1 Enable Google Sign-In
1. In Firebase Console, go to **Build > Authentication > Sign-in method**.
2. Click **Add new provider** and select **Google**.
3. Enable the provider, set the public-facing project support email, and save.

### 2.2 Authorized Domains
Under **Authentication > Settings > Authorized domains**, add:
- `localhost` (for local development testing).
- `focusflow.yourdomain.com` (your production custom domain).
- `your-production-project.firebaseapp.com` (default Firebase hosting domain).
- `your-production-project.web.app` (default secondary Firebase domain).

### 2.3 Google Cloud OAuth Consent Screen & Scopes
1. Open the [Google Cloud Console](https://console.cloud.google.com/) for your project.
2. Go to **APIs & Services > OAuth consent screen**.
3. Set user type to **External**, enter App Name ("FocusFlow & Finance"), and Developer Contact Information.
4. Add the required Google Workspace scopes:
   - `https://www.googleapis.com/auth/spreadsheets` (read/write Google Sheets).
   - `https://www.googleapis.com/auth/drive.file` (create/access user spreadsheets created by FocusFlow).
5. Submit for OAuth verification if making the application publicly accessible outside test users.

---

## 3. Cloud Firestore Production Configuration

### 3.1 Database Location & Mode
1. In Firebase Console, go to **Build > Firestore Database**.
2. Click **Create database**.
3. Select **Production mode** (initial deny-all default).
4. Choose the primary cloud region nearest your target user base (e.g., `asia-south1` Mumbai, `us-central1` Iowa, or `europe-west1` Belgium).
   > [!IMPORTANT]
   > The database location cannot be changed after creation.

### 3.2 Deploy Security Rules
Deploy the hardened [firestore.rules](file:///Users/munshimdatif/Downloads/focusflow-&-finance/firestore.rules) file using the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

**Security Rules Architecture:**
- **Default Deny:** `match /{document=**} { allow read, write: if false; }` blocks any unscoped access.
- **Strict Ownership:** Every document in `/users/{userId}/**` mandates `request.auth.uid == userId`.
- **Paise Validation:** Financial documents enforce positive or non-negative integers bounded by `1000000000000` paise ($₹10\text{ Cr}$).
- **Status & Priority Enums:** Restricts statuses to `['todo', 'in_progress', 'completed']` and priorities to `['low', 'medium', 'high']`.

### 3.3 Deploy Composite Indexes
Deploy the composite indexes defined in [firestore.indexes.json](file:///Users/munshimdatif/Downloads/focusflow-&-finance/firestore.indexes.json):

```bash
firebase deploy --only firestore:indexes
```

These indexes accelerate:
- Task queries by `userId` + `dueDate` + `status`.
- Transaction queries by `userId` + `date` DESC.
- Bill queries by `userId` + `dueDate` + `status`.
- Audit log queries by `userId` + `timestamp` DESC.

---

## 4. Web App Registration

1. In Firebase Console, go to **Project settings > General**.
2. Under **Your apps**, click the **Web icon (</>)** to register a web app.
3. Name it `FocusFlow Web`.
4. Copy the generated SDK configuration parameters into your production `.env` file (or replace placeholders in [firebase-applet-config.json](file:///Users/munshimdatif/Downloads/focusflow-&-finance/firebase-applet-config.json)).

---

## 5. App Check (Abuse & Scraping Prevention)

To prevent unauthorized API access, bot scraping, and quota exhaustion:
1. Go to **Build > App Check** in the Firebase Console.
2. Register your Web App with **reCAPTCHA Enterprise** or **reCAPTCHA v3**.
3. Enforce App Check on Cloud Firestore once production traffic is verified.

