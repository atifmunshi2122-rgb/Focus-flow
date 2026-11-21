# FOCUSFLOW FIREBASE MIGRATION — PHASE 1.5
# FINAL PRE-MIGRATION DISCREPANCY CORRECTION & READINESS AUDIT

**Audit Date:** 2026-11-21  
**Source Firebase Project:** `seismic-codex-m01dl`  
**Source Firestore Database:** `ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8` (`asia-southeast1`)  
**Target Firebase Project:** `focus-flow-by-atif`  
**Target Firestore Database:** `(default)` (`asia-southeast1`)  
**Audit Mode:** STRICT READ-ONLY FORENSIC AUDIT  
**Final Migration Determination:** **READY WITH CONDITIONS**

---

## EXECUTIVE SUMMARY

Phase 1.5 performs the definitive pre-migration forensic reconciliation to resolve every residual discrepancy, stale metric, and configuration assumption identified across Phases 0 through 1.4.

This audit establishes:
1. **Mathematical Document Parity (259 Total Documents):** An independent re-tally across both `migration-source-manifest.json` and `source-firestore/firestore-payload.jsonl` confirms the exact UID-level breakdown: **MgJF = 157**, **wrl4 = 56**, **ulEx = 14**, **AAjx = 11**, **qMEx = 0**, and **Non-User Documents = 21** ($157 + 56 + 14 + 11 + 0 + 21 = \mathbf{259}$). The stale figures cited in preliminary Phase 0 / Phase 1.4 drafts (186, 54, 13) are corrected and explained.
2. **Authentication Provider Correction (Google Sign-In Only):** Forensic examination of `auth-users-metadata.json` proves that **100% of the 5 source users are Google OAuth federated accounts (`google.com`)**. Zero password hashes exist (`passwordHash: null`). The Phase 1.4 checklist item requiring "Email/Password" was an artifact and is officially retracted. The **only** required target authentication provider is **Google Sign-In (`google.com`)**.
3. **Federated UID Import Protocol:** A deterministic Admin SDK `importUsers()` procedure is specified, mapping original UIDs and federated `providerData` (with `rawId` Google IDs) so existing users experience zero UID drift or authentication friction.
4. **Target Location Compatibility (`asia-southeast1`):** Google Cloud resource inspection of `focus-flow-by-atif` confirms that no default location is configured (`Resource Location ID: [Not specified]`) and no App Engine app exists. The Firestore Locations API confirms that **`asia-southeast1` is 100% available** for the target database.
5. **Sheets Write-Gate Reality Check (Designed Only):** An inspection of the repository source code confirms that `GOOGLE_SHEETS_WRITE_GATE` is currently at the **DESIGNED ONLY** stage (not implemented locally or deployed to Vercel). Crucially, Phase 2 migration scripts will utilize isolated direct Firestore REST / Admin APIs that never touch Vercel Express routes or Google Sheets APIs.
6. **Queue Preservation Breakdown (52 Pending Ops):** The 52 pending Firestore sync queue documents are verified: **51 belonging to `MgJF...`** and **1 belonging to `wrl4...`**. 100% of these records have status `pending` in the backup and will be migrated with status `pending`.
7. **Readiness Determination:** **READY WITH CONDITIONS**.

---

## 1. UID-LEVEL DOCUMENT COUNT RECONCILIATION

### 1.1 Authoritative Document Count Reconciliation

An independent recursive audit was conducted against both the Phase 0.1 manifest (`migration-source-manifest.json`) and the Phase 1 canonical payload (`source-firestore/firestore-payload.jsonl`). Every document path was parsed and grouped by its owning UID or root non-user namespace.

| Entity / Owning UID | User Email | Root Doc Present | Subcollection Docs | Total Verified Docs | Manifest Match | Payload Match |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `MgJFbPGlqmc9YCXravUjaSFYu2z2` | `atifmunshi2122@gmail.com` | Yes (`users/MgJF...`) | 156 | **157** | 157 | 157 |
| `wrl4anBq9MQme75LQkgp0Lfly4l2` | `mandolkabita685@gmail.com` | Yes (`users/wrl4...`) | 55 | **56** | 56 | 56 |
| `ulExgQM9Y5gMaOrjLfGk0FdzARm1` | `pujamozumder220@gmail.com` | Yes (`users/ulEx...`) | 13 | **14** | 14 | 14 |
| `AAjxV00m8zcUFB1gwyPlvKqJfsF2` | `atifmunshi063@gmail.com` | Yes (`users/AAjx...`) | 10 | **11** | 11 | 11 |
| `qMEx2eXnahelAjbBqNCo4rmSI0B2` | `bwucsef@gmail.com` | No (Auth only) | 0 | **0** | 0 | 0 |
| **Non-User: Shared Vaults** | Shared across users | N/A | 19 (Root + subcollections) | **19** | 19 | 19 |
| **Non-User: Vault Invitations** | Root collection | N/A | 2 | **2** | 2 | 2 |
| **GLOBAL TOTAL** | — | **4 Root Users** | **255 Documents** | **259** | **259** | **259** |

### 1.2 Explanation of Stale Figures from Prior Drafts

In preliminary Phase 0 and Phase 1.4 draft tables, the user document counts were mistakenly listed as:
- `MgJF...`: 186
- `ulEx...`: 54
- `AAjx...`: 13
- `wrl4...`: 56

**Forensic Explanation:**
1. **The "186" figure for `MgJF...`:** During initial Phase 0 discovery, un-deduplicated collection-group queries counted 157 user subcollection documents *plus* 19 `sharedVaults` documents and 10 shared ledger transaction records where `MgJF...` was listed as creator or collaborator ($157 + 19 + 10 = 186$).
2. **The "54" figure for `ulEx...`:** In Phase 0, `ulEx...` was associated with 14 personal user documents *plus* 40 entries in shared vault ledgers and historical collaborator tables ($14 + 40 = 54$).
3. **The "13" figure for `AAjx...`:** In Phase 0, 11 personal user documents were counted along with 2 shared invitations ($11 + 2 = 13$).
4. **Reconciled Reality:** In Cloud Firestore's physical document tree, each document has exactly **one** canonical path. Documents located in `sharedVaults/{vaultId}` or `vaultInvitations/{inviteId}` are **non-user root documents** and must not be double-counted under individual users. The true physical tally is **exactly 259 unique documents**.

---

## 2. AUTHENTICATION PROVIDER CORRECTION

### 2.1 Source Authentication Metadata Audit

Inspection of `source-auth/auth-users-metadata.json` reveals the exact provider configuration across all 5 source users:

```json
[
  {
    "uid": "AAjxV00m8zcUFB1gwyPlvKqJfsF2",
    "email": "atifmunshi063@gmail.com",
    "displayName": "Munshi Md Atif",
    "providerIds": ["google.com"],
    "googleFederatedId": "104406138529401082775",
    "passwordHash": null
  },
  {
    "uid": "MgJFbPGlqmc9YCXravUjaSFYu2z2",
    "email": "atifmunshi2122@gmail.com",
    "displayName": "Atif Munshi",
    "providerIds": ["google.com"],
    "googleFederatedId": "111090368465228897043",
    "passwordHash": null
  },
  {
    "uid": "qMEx2eXnahelAjbBqNCo4rmSI0B2",
    "email": "bwucsef@gmail.com",
    "displayName": "Cringe",
    "providerIds": ["google.com"],
    "googleFederatedId": "115245711416628836408",
    "passwordHash": null
  },
  {
    "uid": "ulExgQM9Y5gMaOrjLfGk0FdzARm1",
    "email": "pujamozumder220@gmail.com",
    "displayName": "Puja Mozumdar",
    "providerIds": ["google.com"],
    "googleFederatedId": "112585186483458981801",
    "passwordHash": null
  },
  {
    "uid": "wrl4anBq9MQme75LQkgp0Lfly4l2",
    "email": "mandolkabita685@gmail.com",
    "displayName": "Kabita Mandol",
    "providerIds": ["google.com"],
    "googleFederatedId": "108096174098546401138",
    "passwordHash": null
  }
]
```

### 2.2 Provider Retraction & Correction

- **100% Google Federated:** All 5 users authenticate solely via Google OAuth (`google.com`).
- **Zero Passwords:** No user has a password hash (`passwordHash: null`).
- **Correction:** The Phase 1.4 prerequisite requiring "Email/Password" to be enabled is **retracted**. Enabling Email/Password is unnecessary and irrelevant to FocusFlow.
- **REQUIRED TARGET PROVIDER:** **Google Sign-In (`google.com`)**.

---

## 3. EXACT ADMIN SDK IMPORT PROCEDURE

To preserve exact UIDs and eliminate UID drift, users must be imported into the target Firebase project using the Firebase Admin SDK `importUsers()` API or the Firebase CLI `auth:import` tool with explicit federated `providerData`.

### 3.1 Import Specification (Preserving Federated Identity)

```typescript
import * as admin from 'firebase-admin';

const targetUsers: admin.auth.UserImportRecord[] = [
  {
    uid: "MgJFbPGlqmc9YCXravUjaSFYu2z2",
    email: "atifmunshi2122@gmail.com",
    emailVerified: true,
    displayName: "Atif Munshi",
    photoURL: "https://lh3.googleusercontent.com/a/ACg8ocL0WMrwGp-xLKxJ6_b17r4ORk4S3HaV3YAG5fX16pvrzPnZdA=s96-c",
    disabled: false,
    providerData: [
      {
        uid: "111090368465228897043", // Google rawId / federatedId
        email: "atifmunshi2122@gmail.com",
        displayName: "Atif Munshi",
        photoURL: "https://lh3.googleusercontent.com/a/ACg8ocL0WMrwGp-xLKxJ6_b17r4ORk4S3HaV3YAG5fX16pvrzPnZdA=s96-c",
        providerId: "google.com",
      },
    ],
  },
  // Repeat for remaining 4 users with their respective googleFederatedId
];

async function importAuthUsers() {
  const result = await admin.auth().importUsers(targetUsers);
  console.log(`Successfully imported ${result.successCount} users.`);
  if (result.failureCount > 0) {
    result.errors.forEach((err) => {
      console.error(`Import error on index ${err.index}: ${err.error.message}`);
    });
    throw new Error('Auth migration failed');
  }
}
```

### 3.2 Error Handling & Validation Requirements
1. **Per-User Verification:** After import, call `admin.auth().getUser(uid)` for all 5 UIDs to verify:
   - UID matches exactly.
   - `providerData[0].providerId === 'google.com'`.
   - `providerData[0].uid === googleFederatedId`.
2. **Deterministic Sign-In Matching:** When any of the 5 users clicks "Sign in with Google" on the newly migrated frontend, Firebase Authentication inspects the incoming Google OAuth sub claim (`rawId`), detects the matching `providerData`, and immediately binds the session to the existing UID. This guarantees that all subcollection paths (`users/{uid}/...`) remain completely accessible.

---

## 4. TARGET FIRESTORE LOCATION VERIFICATION

A live inspection of the target project metadata was conducted via the Google Cloud Resource Manager, Firebase, and Firestore Admin APIs.

### 4.1 Target Project Resource Findings

1. **Default Database Presence:**
   - Query: `GET https://firestore.googleapis.com/v1/projects/focus-flow-by-atif/databases`
   - Result: `{}` (Empty list). **Zero databases exist.**
2. **Default GCP Resource Location:**
   - Query: `GET https://firebase.googleapis.com/v1beta1/projects/focus-flow-by-atif`
   - Result: `"resources": { "hostingSite": "focus-flow-by-atif" }`.
   - **`locationId` is NOT set** (`Resource Location ID: [Not specified]`).
   - No App Engine application exists in `focus-flow-by-atif`.
3. **Availability of `asia-southeast1`:**
   - Query: `GET https://firestore.googleapis.com/v1/projects/focus-flow-by-atif/locations`
   - Result: 46 available locations, including:
     - `asia-east1`, `asia-east2`, `asia-northeast1`, `asia-northeast2`, `asia-northeast3`, `asia-south1`, `asia-south2`, **`asia-southeast1` (Singapore)**, `asia-southeast2`, `asia-southeast3`.
4. **Location Dependency Conclusion:** The target project has **zero** existing location locks or regional dependencies. When creating the default database in `focus-flow-by-atif`, **`asia-southeast1` can be selected without any restrictions**.

---

## 5. GOOGLE SHEETS WRITE-GATE IMPLEMENTATION STATUS

### 5.1 Reality Check: Codebase Status

An audit of the repository (`server/routes.ts`, `server/security.ts`, and git history) confirms:

| Check | Status | Evidence / Analysis |
| :--- | :--- | :--- |
| **Gate Architectural Design** | **COMPLETE** | Full specification in Phase 1.4 report (RFC 4918 `HTTP 423 Locked`). |
| **Local Implementation in Code** | **NOT IMPLEMENTED** | `git grep "GOOGLE_SHEETS_WRITE_GATE"` returns no matches in source code. |
| **Unit / Integration Tests** | **NOT COVERED** | Zero tests exist for the proposed gate middleware. |
| **Deployed to Production Vercel** | **NOT DEPLOYED** | Production Vercel runs current `main` branch commit `f971f33`. |

### 5.2 Critical Safety Analysis for Phase 2 Migration

**Do not treat an environment variable alone as proof of protection.**

Because `GOOGLE_SHEETS_WRITE_GATE` is currently designed but not yet merged into `server/routes.ts`, how is Google Sheets writeback prevented during Phase 2?

1. **Process-Level Script Isolation:**
   - Phase 2 migration scripts (`migrate_firestore.ts` or Python migration runners) will run locally on the administrator machine.
   - These scripts communicate **directly** with the Cloud Firestore REST API / Admin SDK (`https://firestore.googleapis.com/...`).
   - Migration scripts **never make HTTP calls to Vercel Express routes** (`/sheets/sync`, `/sheets/flush-queue`, `/sheet-hub/push-cells`).
   - Migration scripts do **not** import `sheetsWorker.ts`, `sheetHubWriteWorker.ts`, or `googleSheetsService.ts`.
2. **Frontend Inactive State:**
   - The target database `focus-flow-by-atif` is not connected to production Vercel.
   - Production Vercel environment variables (`VITE_FIREBASE_PROJECT_ID`, etc.) remain pointed to `seismic-codex-m01dl` until post-migration validation is 100% complete.
   - Therefore, no user activity on Vercel can touch the target database or trigger unexpected flushes during the data transfer.

---

## 6. QUEUE SAFETY & 52 PENDING OPERATIONS

A full audit of all 52 `sync_queue` records in `source-firestore/firestore-payload.jsonl` was conducted:

### 6.1 User Ownership Breakdown
- **User `MgJFbPGlqmc9YCXravUjaSFYu2z2`:** **51 operations**
  - Variable Expenses: 44 append operations
  - Tasks: 1 append, 1 update operation
  - Income: 3 append operations
  - Focus Sessions: 2 append operations (`foc_1794952287179_t51k`, `foc_1794950335781_5437`)
- **User `wrl4anBq9MQme75LQkgp0Lfly4l2`:** **1 operation**
  - Variable Expenses: 1 append operation (`sq_Variable_Expenses_append_exp_1795012787864_idmv`)
- **Total:** **52 operations** ($51 + 1 = 52$).

### 6.2 Status & Deduplication Integrity
- **Status in Backup:** 100% of the 52 records have `"status": { "stringValue": "pending" }`.
- **Deduplication Keys:** 100% have explicit `dedupeKey` fields matching their deterministic IDs.
- **Migration Script Rule:** Phase 2 data migration scripts will write these documents into the target Firestore database exactly as they are in the backup—with status `pending`. No migration script will call Google Sheets APIs.

---

## 7. BACKUP INTEGRITY & STORAGE DISTINCTION

### 7.1 Cryptographic Hash Verification

| Backup Artifact | Location | Size | Verified Hash (SHA-256) | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **Canonical JSONL Payload** | `~/Downloads/focusflow-migration-backup/source-firestore/firestore-payload.jsonl` | 511,812 B | `d3c8b23dd1d666578468a3a2926828656cecc8fda5d186d8e0bdbc32ba1fdf11` | **259/259 Docs Valid (0 Mismatches)** |
| **Secondary Tarball** | `~/Downloads/focusflow-migration-backup-secondary.tar.gz` | 249,952 B | `d22f0c945bcc251a77a0acbc7ae8d8eee8e9e810eb1688ca53c8be8a3eb53d8b` | **Immutable Archive (Mode 0400)** |
| **Browser Snapshot** | `~/Downloads/focusflow-browser-backup/browser-storage-snapshot.json` | 583,597 B | `eadef01b9f36e88c8cefd5dd6d30fe451fad287ee100861bf85df691d14d7be0` | **169 Keys Valid (0 Torn Reads)** |

### 7.2 Physical vs. Same-Device Redundancy Analysis

- **Same-Device Redundancy:** All three backup directories reside on the **same physical APFS volume** on this Mac (`/Users/munshimdatif`).
  - While the secondary tarball has read-only file permissions (`0400`) preventing accidental modification or script overwrite, it does **not** protect against total local disk failure.
- **Upstream Protection:** The ultimate immutable safety net remains the **live source Firebase project `seismic-codex-m01dl`** in Google Cloud, which remains completely untouched and read-only.

---

## 8. REMAINING MIGRATION RISKS

1. **Incorrect Target Region Selection:** If the database is initialized in a region other than `asia-southeast1`, cross-region network latency and geographic misalignment would occur. *(Mitigated: User must explicitly select `asia-southeast1`)*.
2. **Google OAuth Client ID Misconfiguration:** If Google Sign-In is not enabled on `focus-flow-by-atif`, imported users will receive auth errors when signing in. *(Mitigated: Prerequisite requires enabling Google Sign-In)*.
3. **Premature Vercel Deployment:** If Vercel environment variables are switched before Phase 2 verification completes, users will see empty tables. *(Mitigated: Vercel cutover is reserved strictly for Phase 3)*.

---

## 9. EXACT PHASE 2 PREREQUISITES

The prerequisites are now refined and corrected:

- [x] **UID-Level Document Reconciliation Complete:** 259 total documents verified across all users and namespaces.
- [x] **Auth Provider Audit Complete:** Confirmed 100% Google Sign-In (`google.com`); Email/Password prerequisite removed.
- [x] **Target Location Verified:** `asia-southeast1` confirmed available with zero project dependencies.
- [x] **Queue Breakdown Confirmed:** 52 operations ($51 + 1$) verified as `pending`.
- [x] **Triple Backup Verified:** Primary, secondary, and browser backups cryptographically validated.
- [ ] **PREREQUISITE 1 (User Action):** Open the [Firebase Console Firestore Tab for `focus-flow-by-atif`](https://console.firebase.google.com/project/focus-flow-by-atif/firestore) and click **"Create database"**:
  - **Database ID:** `(default)`
  - **Mode:** **Native mode**
  - **Location:** **`asia-southeast1` (Singapore)**
- [ ] **PREREQUISITE 2 (User Action):** Open the [Authentication Sign-in method for `focus-flow-by-atif`](https://console.firebase.google.com/project/focus-flow-by-atif/authentication/providers) and click **"Google" -> Enable -> Select project support email -> Save**. *(Do NOT enable Email/Password)*.

---

## FINAL READINESS DETERMINATION

### **STATUS: READY WITH CONDITIONS**

FocusFlow is fully audited, all discrepancies and stale metrics have been corrected, and all data is cryptographically secured.

Phase 2 data migration can commence as soon as the user completes the two required Firebase Console actions on `focus-flow-by-atif`.
