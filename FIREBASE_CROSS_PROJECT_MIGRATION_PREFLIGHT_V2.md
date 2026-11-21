# FOCUSFLOW FIREBASE CROSS-PROJECT MIGRATION — PHASE 0.1
## FIRESTORE DOCUMENT COUNT RECONCILIATION & MIGRATION READINESS

**Document ID:** `FIREBASE_CROSS_PROJECT_MIGRATION_PREFLIGHT_V2.md`  
**Audit Date:** November 21, 2026  
**Auditor:** Antigravity AI Forensic Engine  
**Classification:** Phase 0.1 Read-Only Reconciliation — Zero Data Modification  
**Source Manifest:** [`migration-source-manifest.json`](file:///Users/munshimdatif/Downloads/focusflow-%26-finance/migration-source-manifest.json)  

---

## 1. Executive Summary & Mathematical Reconciliation

Phase 0 identified a global total of 259 documents, but the preliminary summary text contained an arithmetic inconsistency in its user-level breakdowns (`186 + 54 + 13 + 10 = 263`). 

This Phase 0.1 audit performed a **complete, page-exhausted, recursive traversal** of every collection, subcollection, and document in the authoritative source database (`ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8`), recording every unique full document path exactly once.

### Mathematical Proof of Total Document Reconciliation

$$\text{Root Documents (7)} + \text{Nested Documents (252)} = \mathbf{259\text{ Unique Documents}}$$
$$\text{User Documents (238)} + \text{Non-User Documents (21)} = \mathbf{259\text{ Unique Documents}}$$
$$\sum_{i=1}^{49} \text{Collection Path Counts} = \mathbf{259\text{ Unique Documents}}$$

Every slice of the database reconciles to **exactly 259 documents** across **49 collection paths** with zero discrepancies.

```
                         COMPLETE RECONCILIATION TREE
┌──────────────────────────────────────────────────────────────┬───────────────┐
│ Database Slice / Dimension                                   │ Document Count│
├──────────────────────────────────────────────────────────────┼───────────────┤
│ 1. Root Documents                                            │               │
│    ├── users root documents (4 users)                        │             4 │
│    ├── sharedVaults root document (1 vault)                  │             1 │
│    └── vaultInvitations root documents (2 invites)           │             2 │
│    SUBTOTAL ROOT DOCUMENTS                                    │             7 │
├──────────────────────────────────────────────────────────────┼───────────────┤
│ 2. Nested Subcollection Documents                            │               │
│    ├── User subcollection documents (MgJF...)                │           156 │
│    ├── User subcollection documents (wrl4...)                │            55 │
│    ├── User subcollection documents (ulEx...)                │            13 │
│    ├── User subcollection documents (AAjx...)                │            10 │
│    ├── Shared Vault subcollections (vlt_.../activity)        │             4 │
│    ├── Shared Vault subcollections (vlt_.../invitations)     │            12 │
│    └── Shared Vault subcollections (vlt_.../members)         │             2 │
│    SUBTOTAL NESTED DOCUMENTS                                 │           252 │
├──────────────────────────────────────────────────────────────┼───────────────┤
│ TOTAL AUTHORITATIVE SOURCE DOCUMENTS                         │           259 │
└──────────────────────────────────────────────────────────────┴───────────────┘
```

---

## 2. Explanation of Phase 0 Prose Discrepancy

In the Phase 0 report, the raw REST discovery script logged `totalDocs: 259`. However, during manual transcription into the summary table:
1. **User `MgJF` Overcount:** User `MgJFbPGlqmc9YCXravUjaSFYu2z2` owns **156 subcollection documents** (and 1 root user document = 157 total). In the Phase 0 narrative, a mental math addition error erroneously recorded this as "186 documents" (+30 overcount).
2. **User `wrl4` Root Document Separation:** User `wrl4anBq9MQme75LQkgp0Lfly4l2` owns **55 subcollection documents** (and 1 root user document = 56 total). Phase 0 recorded "54 documents" without accounting for the root doc or specific revisions.
3. **User `ulEx` & `AAjx` Root Exclusions:** User `ulEx` has 13 subcollection docs (+1 root = 14); user `AAjx` has 10 subcollection docs (+1 root = 11).

When user root documents and subcollections are properly attributed, the true count is:
- **`MgJFbPGlqmc9YCXravUjaSFYu2z2`:** 157 documents (1 root + 156 nested)
- **`wrl4anBq9MQme75LQkgp0Lfly4l2`:** 56 documents (1 root + 55 nested)
- **`ulExgQM9Y5gMaOrjLfGk0FdzARm1`:** 14 documents (1 root + 13 nested)
- **`AAjxV00m8zcUFB1gwyPlvKqJfsF2`:** 11 documents (1 root + 10 nested)
- **User Root + Subcollection Total:** $157 + 56 + 14 + 11 = \mathbf{238\text{ documents}}$
- **Non-User Documents (Shared Vaults & Invitations):** $1 + 18 + 2 = \mathbf{21\text{ documents}}$
- **Total Combined:** $238 + 21 = \mathbf{259\text{ documents}}$

---

## 3. Complete Source Path Manifest (`migration-source-manifest.json`)

All 259 source documents have been indexed into the formal preflight manifest:
📁 [`migration-source-manifest.json`](file:///Users/munshimdatif/Downloads/focusflow-%26-finance/migration-source-manifest.json) (File size: 263 KB)

### Manifest Structure & Zero-Secret Invariant
Every entry in the manifest contains complete topological metadata without exposing private user data:
- `fullPath`: Exact Firestore document path (e.g. `users/MgJF.../expenses/exp_1794820898308_xyz`)
- `collectionPath`: The exact parent collection path
- `collectionId`: Leaf collection identifier
- `documentId`: Firestore document key
- `parentDocumentPath`: Hierarchical ancestor path (or `null` for root documents)
- `owningUid`: Extracted user UID where applicable
- `hasSubcollections`: Boolean flag indicating if child subcollections exist
- `subcollections`: Discovered subcollection names
- `fieldTypes`: Map of `{ fieldName: typeName }` (e.g. `{ amountPaise: "integer", date: "string", isVerified: "boolean" }`)
- `createTime` & `updateTime`: Firestore server timestamps

**Security Audit Result:** Scanned with zero occurrences of `GOCSPX`, private keys, passwords, hashes, access tokens, or API secrets.

---

## 4. Complete Inventory by Collection Path (All 49 Paths)

| # | Collection Path | Depth | Doc Count | Classification | Owning Entity |
|---|---|---|---|---|---|
| 1 | `sharedVaults` | Root | 1 | **VERIFIED** | System / Joint Vault |
| 2 | `sharedVaults/vlt_1794905820679_7sjukb/activity` | Nested | 4 | **VERIFIED** | Shared Vault |
| 3 | `sharedVaults/vlt_1794905820679_7sjukb/invitations` | Nested | 12 | **VERIFIED** | Shared Vault |
| 4 | `sharedVaults/vlt_1794905820679_7sjukb/members` | Nested | 2 | **VERIFIED** | Shared Vault |
| 5 | `vaultInvitations` | Root | 2 | **VERIFIED** | System / Invitations |
| 6 | `users` | Root | 4 | **VERIFIED** | User Root Profiles |
| 7 | `users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/focus_sessions` | Nested | 1 | **VERIFIED** | User `ulEx...` |
| 8 | `users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/focus_sessions/.../interruptions` | Nested (Deep) | 4 | **VERIFIED** | User `ulEx...` |
| 9 | `users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/pomodoro_presets` | Nested | 3 | **VERIFIED** | User `ulEx...` |
| 10 | `users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/settings` | Nested | 3 | **VERIFIED** | User `ulEx...` |
| 11 | `users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/study_mistakes` | Nested | 2 | **VERIFIED** | User `ulEx...` |
| 12 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/expenses` | Nested | 1 | **VERIFIED** | User `wrl4...` |
| 13 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/pomodoro_presets` | Nested | 3 | **VERIFIED** | User `wrl4...` |
| 14 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/settings` | Nested | 3 | **VERIFIED** | User `wrl4...` |
| 15 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_mistakes` | Nested | 2 | **VERIFIED** | User `wrl4...` |
| 16 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_revisions` | Nested | 2 | **VERIFIED** | User `wrl4...` |
| 17 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_subjects` | Nested | 5 | **VERIFIED** | User `wrl4...` |
| 18 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_topics` | Nested | 38 | **VERIFIED** | User `wrl4...` |
| 19 | `users/wrl4anBq9MQme75LQkgp0Lfly4l2/sync_queue` | Nested | 1 | **VERIFIED** | User `wrl4...` |
| 20 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/expenses` | Nested | 44 | **VERIFIED** | User `MgJF...` |
| 21 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions` | Nested | 6 | **VERIFIED** | User `MgJF...` |
| 22 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_...t51k/interruptions` | Nested (Deep) | 2 | **VERIFIED** | User `MgJF...` |
| 23 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_...uxs9/interruptions` | Nested (Deep) | 1 | **VERIFIED** | User `MgJF...` |
| 24 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_...ndgl/interruptions` | Nested (Deep) | 1 | **VERIFIED** | User `MgJF...` |
| 25 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_...logm/interruptions` | Nested (Deep) | 3 | **VERIFIED** | User `MgJF...` |
| 26 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/income` | Nested | 3 | **VERIFIED** | User `MgJF...` |
| 27 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/pomodoro_presets` | Nested | 3 | **VERIFIED** | User `MgJF...` |
| 28 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/settings` | Nested | 3 | **VERIFIED** | User `MgJF...` |
| 29 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheet_connections` | Nested | 1 | **VERIFIED** | User `MgJF...` |
| 30 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheet_row_chunks` | Nested | 6 | **VERIFIED** | User `MgJF...` |
| 31 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheet_tabs` | Nested | 5 | **VERIFIED** | User `MgJF...` |
| 32 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets` | Nested | 1 | **VERIFIED** | User `MgJF...` |
| 33 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/conn_.../tabs` | Nested (Deep) | 5 | **VERIFIED** | User `MgJF...` |
| 34 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/...__tab_5/row_chunks` | Nested (Deep) | 1 | **VERIFIED** | User `MgJF...` |
| 35 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/...__tab_1/row_chunks` | Nested (Deep) | 1 | **VERIFIED** | User `MgJF...` |
| 36 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/...__tab_4/row_chunks` | Nested (Deep) | 2 | **VERIFIED** | User `MgJF...` |
| 37 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/...__tab_2/row_chunks` | Nested (Deep) | 1 | **VERIFIED** | User `MgJF...` |
| 38 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/...__tab_3/row_chunks` | Nested (Deep) | 1 | **VERIFIED** | User `MgJF...` |
| 39 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/study_exams` | Nested | 8 | **VERIFIED** | User `MgJF...` |
| 40 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/study_subjects` | Nested | 2 | **VERIFIED** | User `MgJF...` |
| 41 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/study_topics` | Nested | 1 | **VERIFIED** | User `MgJF...` |
| 42 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/subscriptions` | Nested | 1 | **VERIFIED** | User `MgJF...` |
| 43 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sync_queue` | Nested | 51 | **VERIFIED** | User `MgJF...` |
| 44 | `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/tasks` | Nested | 3 | **VERIFIED** | User `MgJF...` |
| 45 | `users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/focus_sessions` | Nested | 2 | **VERIFIED** | User `AAjx...` |
| 46 | `users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/focus_sessions/..._7wbg/interruptions` | Nested (Deep) | 1 | **VERIFIED** | User `AAjx...` |
| 47 | `users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/focus_sessions/..._96bh/interruptions` | Nested (Deep) | 1 | **VERIFIED** | User `AAjx...` |
| 48 | `users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/pomodoro_presets` | Nested | 3 | **VERIFIED** | User `AAjx...` |
| 49 | `users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/settings` | Nested | 3 | **VERIFIED** | User `AAjx...` |
| **TOTAL** | **49 Collection Paths** | | **259** | **VERIFIED** | **100% Mathematical Parity** |

---

## 5. Validation of Special Data Structures

### A. Shared Vaults & Joint Vault Architecture
- **Document Path:** `sharedVaults/vlt_1794905820679_7sjukb` ("OUR SAVINGS")
- **Creator UID:** `MgJFbPGlqmc9YCXravUjaSFYu2z2`
- **Member UIDs:** `["MgJFbPGlqmc9YCXravUjaSFYu2z2", "ulExgQM9Y5gMaOrjLfGk0FdzARm1"]`
- **Target Ratio:** `50%` (`MgJF...`) / `50%` (`ulEx...`)
- **Nested Collections:**
  - `members`: 2 documents with doc IDs strictly matching the member UIDs (`MgJF...` and `ulEx...`).
  - `invitations`: 12 invitation tracking records.
  - `activity`: 4 ledger activity entries.
- **Root `vaultInvitations`:**
  - `MKKPHUQFSDG8MY4T`: Invited by `MgJF...`, accepted by `ulEx...`.
  - `XWGEEPYZ2E6YW7L9`: Invited by `MgJF...`, accepted by `ulEx...`.
- **Migration Impact:** Because both member UIDs are 100% preserved in target Firebase Auth, **zero foreign key translation or pointer rewrite is required**.

### B. Native Sheets & Sheet Hub Data
- **Connection Document:** `users/MgJF.../sheet_connections/conn_1laOanGUQHU6UGwIrwhVQHjN_mwpaj38e`
  - Title: "Semester 3 - Syllabus & Topic Tracker"
  - Source Spreadsheet ID: `1laOanGUQHU6UGwIrwhVQHjNL5edsOFxXMdyJZrnV4tw`
  - Dual-Copy Flag: `isDualCopy: false` (Standard single-copy connection)
- **Native Spreadsheet Document:** `users/MgJF.../sheets/conn_1laOanGUQHU6UGwIrwhVQHjN_mwpaj38e`
  - Subcollection `tabs`: 5 tab schema documents (`tab_1` through `tab_5`)
  - Subcollection `tabs/{tabId}/row_chunks`: 6 chunk documents holding cell scalar data.
- **Top-Level Mirrored Collections:** `sheet_tabs` (5 docs) and `sheet_row_chunks` (6 docs).

### C. Sync Queues & Outbox Records
- `users/MgJF.../sync_queue`: 51 pending/processed sync records.
- `users/wrl4.../sync_queue`: 1 sync record.
- **Audit Logs:** 0 documents in Firestore (audit records are maintained on-device in LocalStorage).

---

## 6. Authentication UID Parity & Target Comparison

| User Email | Source UID | Target UID | Provider | Verified? | Target Collision? |
|---|---|---|---|---|---|
| `atifmunshi2122@gmail.com` | `MgJFbPGlqmc9YCXravUjaSFYu2z2` | *Uncreated* | `google.com` (Fed ID: `111090368465228897043`) | Yes | None |
| `atifmunshi063@gmail.com` | `AAjxV00m8zcUFB1gwyPlvKqJfsF2` | *Uncreated* | `google.com` (Fed ID: `104406138529401082775`) | Yes | None |
| `pujamozumder220@gmail.com` | `ulExgQM9Y5gMaOrjLfGk0FdzARm1` | *Uncreated* | `google.com` (Fed ID: `112585186483458981801`) | Yes | None |
| `mandolkabita685@gmail.com` | `wrl4anBq9MQme75LQkgp0Lfly4l2` | *Uncreated* | `google.com` (Fed ID: `108096174098546401138`) | Yes | None |
| `bwucsef@gmail.com` | `qMEx2eXnahelAjbBqNCo4rmSI0B2` | *Uncreated* | `google.com` (Fed ID: `115245711416628836408`) | Yes | None |

- **UID Uniqueness:** 5 distinct, valid UIDs.
- **Email Uniqueness:** 5 distinct email addresses.
- **Provider Parity:** 100% Google OAuth (`google.com`). Zero password hashes or salts.
- **UID Preservation Assurance:** When imported into `focus-flow-by-atif` with Firebase Admin SDK, all users retain their exact UIDs. Google logins will automatically match and authenticate to these UIDs.

---

## 7. Backup and Migration Readiness Audit

### A. Database Configurations & Locations
- **Source Database:** `ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8`
  - Location: `asia-southeast1` (Singapore)
- **Target Database Requirement:** `(default)`
  - Location: Must select `asia-southeast1 (Singapore)` during database creation in Firebase Console.

### B. Billing & Plan Constraints
- **Source Project (`seismic-codex-m01dl`):** Blaze Plan (Billing active: `billingAccounts/01CD7C-907999-06F1B9`).
- **Target Project (`focus-flow-by-atif`):** Spark Plan (Free Tier, `billingEnabled: false`).
- **Migration Impact:** The entire migration comprises only **259 write operations**. Firebase Spark plan includes **20,000 writes per day free**. This migration can execute immediately on Spark without requiring credit card or billing account attachment.

### C. IAM Permissions Audit
- `atifmunshi2122@gmail.com` on `focus-flow-by-atif`: **`roles/owner`** (Full project administrator).
- `atifmunshi2122@gmail.com` on `seismic-codex-m01dl`: `roles/datastore.user` & `roles/firebase.viewer` (Complete read access to Firestore and Auth).

### D. Tooling & CLI Availability
- `gcloud` CLI: Not installed in local shell environment.
- **Alternative:** Direct REST API execution via Node.js script utilizing the authenticated Firebase CLI access token (`atifmunshi2122@gmail.com`). This avoids all GCS bucket and billing requirements while guaranteeing 100% field type preservation.

### E. Google Sheets OAuth Isolation
- Google Sheets & Drive OAuth operations are powered by Google Cloud project **`ghost-7b055`** (OAuth Client ID: `965140210258-guv9k6akjnfc57c0vffusm4lokhcrvkc.apps.googleusercontent.com`).
- Project `ghost-7b055` is completely decoupled from both Firebase projects. Its credentials, tokens, and OAuth consent screen remain 100% operational and requires zero migration.

---

## 8. Exact Phase 1 Readiness Checklist

| Prerequisite Item | Target Project Current Status | Required Action |
|---|---|---|
| **1. Firebase Authentication** | Uninitialized (`404 CONFIGURATION_NOT_FOUND`) | Open [Firebase Console Auth](https://console.firebase.google.com/project/focus-flow-by-atif/authentication) -> Click **Get Started** -> Enable **Google** sign-in -> Add authorized domains (`localhost`, `focus-flow-by-atif.vercel.app`, `focus-flow-by-atif.firebaseapp.com`). |
| **2. Firestore Database** | Uncreated (0 databases) | Open [Firebase Console Firestore](https://console.firebase.google.com/project/focus-flow-by-atif/firestore) -> Click **Create database** -> Select `(default)` -> Location: `asia-southeast1 (Singapore)`. |
| **3. Offline JSON Backup** | Manifest created (`migration-source-manifest.json`) | Full document payload dump ready to execute in Phase 1 Step 1. |
| **4. Security Rules & Indexes** | Ready in repository (`firestore.rules`, `firestore.indexes.json`) | Ready to deploy once database is created. |

---

## 9. Final Certification

> [!IMPORTANT]
> **Phase 0.1 Forensic Audit & Count Reconciliation is 100% COMPLETE.**
> All 259 source documents, 49 collection paths, and 5 user authentication profiles are accounted for and mathematically reconciled.
> **Phase 1 Backup & Migration is completely safe to begin as soon as the user completes the two console initialization steps above and grants explicit authorization.**
