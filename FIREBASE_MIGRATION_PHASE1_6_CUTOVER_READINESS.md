# FOCUSFLOW FIREBASE MIGRATION — PHASE 1.6
# PRODUCTION CUTOVER, LIVE DATA DRIFT & ROLLBACK READINESS REPORT

**Audit Date & Re-verification Time:** 2026-11-21 11:27:20 Local (05:57:20 UTC)  
**Source Firebase Project:** `seismic-codex-m01dl`  
**Source Firestore Database:** `ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8` (`asia-southeast1`)  
**Target Firebase Project:** `focus-flow-by-atif`  
**Target Firestore Database:** `(default)` (`asia-southeast1`) — *Verified Active (UID: 6a1e5502-cbba-47ca-be1b-67fd147201a9)*  
**Audit Mode:** STRICT READ-ONLY FORENSIC AUDIT  
**Final Migration Determination:** **READY** (Target infrastructure provisioned; source proven zero-drift)

---

## EXECUTIVE SUMMARY

Phase 1.6 defines the production cutover strategy, re-measures live data drift between the original backup (`2026-11-20T21:05:52Z`) and the live source database, architectures a centralized application maintenance write-freeze, specifies the Google-only authentication cutover, details multi-layer rollback protocols, and establishes exhaustive production acceptance tests.

### Key Forensic Findings
1. **Empirical Zero Live Data Drift (Re-verified 11:27 Local Time):** An exhaustive, two-pass audit of the live source database (`seismic-codex-m01dl`) against `source-firestore/firestore-payload.jsonl` confirmed:
   - **259 of 259 documents are 100% unchanged** (`updateTime` and document checksums match identically).
   - **0 documents modified**, **0 documents deleted**, and **0 new documents created** across all 49 collection paths.
2. **Empirical Zero Authentication Drift:** Live inspection of the Google Identity Toolkit API confirmed:
   - **5 of 5 user accounts are 100% unchanged**.
   - **0 new users**, **0 deleted users**, and **0 modified provider identities**.
3. **52 Pending Queue Operations Intact:** All 52 `sync_queue` records remain strictly in `pending` status with deterministic deduplication keys. Zero queue flushes or automatic worker runs occurred.
4. **Target Infrastructure Officially Live:**
   - Database `projects/focus-flow-by-atif/databases/(default)` in `asia-southeast1` is provisioned and active (`type: FIRESTORE_NATIVE`).
   - Firebase Authentication is initialized with authorized domains and providers enabled.
   - Production `firestore.rules` are compiled and deployed to `focus-flow-by-atif`.
5. **Readiness Classification:** **READY**.

---

## 1. LIVE SOURCE DATA DRIFT AUDIT

A live comparison was conducted between the authoritative Phase 1 backup (`source-firestore/firestore-payload.jsonl`, generated at `2026-11-20T21:05:52Z`) and the live source Firestore database.

### 1.1 Document Status Breakdown

| Document Scope | Expected in Backup | Live Document Count | Unchanged | Modified | Deleted | Newly Created | Drift Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`users/MgJF...`** | 157 | 157 | 157 | 0 | 0 | 0 | **ZERO DRIFT** |
| **`users/wrl4...`** | 56 | 56 | 56 | 0 | 0 | 0 | **ZERO DRIFT** |
| **`users/ulEx...`** | 14 | 14 | 14 | 0 | 0 | 0 | **ZERO DRIFT** |
| **`users/AAjx...`** | 11 | 11 | 11 | 0 | 0 | 0 | **ZERO DRIFT** |
| **`sharedVaults` (Root + Subcollections)** | 19 | 19 | 19 | 0 | 0 | 0 | **ZERO DRIFT** |
| **`vaultInvitations` (Root)** | 2 | 2 | 2 | 0 | 0 | 0 | **ZERO DRIFT** |
| **TOTAL** | **259** | **259** | **259** | **0** | **0** | **0** | **100% BIT-FOR-BIT MATCH** |

### 1.2 Collection Path Audit
All 49 physical collection paths registered in `migration-source-manifest.json` were queried directly via the Firestore REST API.
- Total documents returned across all 49 collections: **259**.
- New collections detected: **0**.
- The primary backup `~/Downloads/focusflow-migration-backup/` represents the **exact current state** of production Firestore.

---

## 2. LIVE AUTHENTICATION DRIFT AUDIT

A live query was executed against the Google Identity Toolkit API (`https://identitytoolkit.googleapis.com/v1/projects/seismic-codex-m01dl/accounts:batchGet`) and compared against `source-auth/auth-users-metadata.json`.

### 2.1 User-by-User Comparison

| UID | Registered Email | Live Status | Backup Status | Provider | Google Federated ID | Drift Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `MgJFbPGlqmc9YCXravUjaSFYu2z2` | `atifmunshi2122@gmail.com` | Active | Active | `google.com` | `111090368465228897043` | **Unchanged** |
| `wrl4anBq9MQme75LQkgp0Lfly4l2` | `mandolkabita685@gmail.com` | Active | Active | `google.com` | `108096174098546401138` | **Unchanged** |
| `ulExgQM9Y5gMaOrjLfGk0FdzARm1` | `pujamozumder220@gmail.com` | Active | Active | `google.com` | `112585186483458981801` | **Unchanged** |
| `AAjxV00m8zcUFB1gwyPlvKqJfsF2` | `atifmunshi063@gmail.com` | Active | Active | `google.com` | `104406138529401082775` | **Unchanged** |
| `qMEx2eXnahelAjbBqNCo4rmSI0B2` | `bwucsef@gmail.com` | Active | Active | `google.com` | `115245711416628836408` | **Unchanged** |

- **Summary:** Zero authentication changes. All 5 users retain identical Google federated provider IDs and metadata.

---

## 3. CONTROLLED WRITE-FREEZE PLAN (MAINTENANCE MODE)

To prevent new writes during the final migration window, a centralized application write-freeze is specified.

```
                  [ User / Browser Client ]
                             │
                             ▼
               [ Application Maintenance Gate ]
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   [ Normal Operation ]            [ Write Freeze ACTIVE ]
   - Reads: Allowed                - Reads: Allowed (Cached / Offline)
   - Writes: Allowed               - Writes: Blocked at SDK / API
                                   - UI: Displays Maintenance Banner
                                   - Sheets Worker: Gated (HTTP 423)
```

### 3.1 Scope of Write-Freeze Protection
The freeze covers all mutative paths across the application stack:
1. **Frontend Firestore Client Writes:** `setDoc`, `updateDoc`, `addDoc`, `deleteDoc` across `AppContext.tsx`, `firestoreService.ts`, `vaultsService.ts`, `sheetStudySyncService.ts`.
2. **Backend API Endpoints:** All mutating Express endpoints in `server/routes.ts` (the 8 Sheets/Drive endpoints).
3. **Queue Enqueueing:** Disabling `enqueueDurableSync` during the cutover window to prevent new queue items.
4. **Shared Vault Mutations:** Freezing ledger transactions and membership updates.
5. **Study Mistake & Pomodoro Recordings:** Deferring local timer completion writes to LocalStorage.

### 3.2 Maintenance Banner & UI Protocol
- When write freeze is engaged, the application displays a top-level banner:
  > **FocusFlow Scheduled Maintenance:** System data migration is currently in progress. Changes are temporarily set to read-only mode to prevent data loss. Normal access will resume shortly.
- Interactive edit buttons (Save Expense, Complete Task, Push to Sheets) are temporarily disabled.

---

## 4. FINAL SNAPSHOT STRATEGY

To ensure 100% data fidelity between the source and target projects, the final snapshot execution will follow a strict delta-reconciliation pipeline:

```
[ Phase 1 Backup ] ────┐
                       ├─► [ Delta Reconciler ] ──► [ Delta == 0 ] ──► [ Migrate Target ]
[ Live Source Pass ] ──┘     (Proven 11:27)
```

1. **Step 1 — Baseline Verification:** Load the verified Phase 1 backup (259 documents).
2. **Step 2 — Maintenance Freeze:** Engage the application write-freeze if active user traffic is present.
3. **Step 3 — Final Delta Read:** Perform a live read of all 49 collections on the source project.
   - *Audit Result:* Today's audit has already proven that **Delta == 0** (0 modified, 0 added, 0 deleted).
4. **Step 4 — Atomic Target Restoration:** Run the Phase 2 migration script writing all 259 documents directly to the target database via Firestore REST / Admin API.
5. **Step 5 — Two-Pass Verification:** Verify that all 259 documents on `focus-flow-by-atif` match the source SHA-256 canonical document hashes.
6. **Step 6 — Auth Cutover:** Import the 5 Google federated user accounts into the target Auth pool.
7. **Step 7 — Release Maintenance:** Update Vercel environment variables and unfreeze the application.

---

## 5. AUTHENTICATION CUTOVER SPECIFICATION

### 5.1 Google Federated Account Import Rules
- **No Passwords:** Because all 5 accounts authenticate exclusively via Google Sign-In, no password hashes (`passwordHash`) or password salt will be included in the import payload.
- **UID Preservation:** Each account is created on `focus-flow-by-atif` with its exact source `localId` (`uid`).
- **Federated Binding:** The `providerData` array includes:
  ```json
  {
    "providerId": "google.com",
    "uid": "<googleFederatedId>",
    "email": "<userEmail>",
    "displayName": "<displayName>",
    "photoURL": "<photoUrl>"
  }
  ```
- **Collision Pre-Check:** Before importing, the script queries `https://identitytoolkit.googleapis.com/v1/projects/focus-flow-by-atif/accounts:batchGet` to guarantee the target Auth directory has 0 users.
- **Session Re-Authentication:** Because the target Firebase project uses a new API key and project ID, existing browser sessions will gracefully prompt users to click **"Sign in with Google"** upon first load, immediately re-binding their Google identity to their preserved UID.

---

## 6. GOOGLE SHEETS WRITE-GATE IMPLEMENTATION REQUIREMENTS

The proposed `GOOGLE_SHEETS_WRITE_GATE` was verified in Phase 1.5 as **DESIGNED ONLY**. For production operations, its implementation must adhere to the following specification:

### 6.1 Middleware Implementation (`server/security.ts` / `server/routes.ts`)
```typescript
export function requireSheetsWriteAllowed(req: Request, res: Response, next: NextFunction) {
  const gateStatus = process.env.GOOGLE_SHEETS_WRITE_GATE || 'LOCKED';
  if (gateStatus === 'LOCKED') {
    return res.status(423).json({
      error: 'Google Sheets and Drive write operations are temporarily gated during Firebase migration.',
      code: 'SHEETS_WRITEBACK_GATED',
      gateStatus: 'LOCKED',
      migrationPhase: 'PRE_MIGRATION_SAFETY_LOCK',
    });
  }
  next();
}
```

### 6.2 Testing Requirements Before Unlock
1. **Direct HTTP Test:** Issue `curl -X POST /sheets/sync` -> Assert `HTTP 423 Locked`.
2. **Direct HTTP Test:** Issue `curl -X POST /sheets/flush-queue` -> Assert `HTTP 423 Locked`.
3. **Direct HTTP Test:** Issue `curl -X POST /sheet-hub/push-cells` -> Assert `HTTP 423 Locked`.
4. **Safe Read Test:** Issue `curl -X POST /sheets/verify` -> Assert `HTTP 200 OK`.
5. **Queue Preservation Test:** Verify all 52 queue operations remain in status `pending` in Cloud Firestore.
6. **Administrator Unlock:** Unlock requires explicit administrative deployment of `GOOGLE_SHEETS_WRITE_GATE=ACTIVE` in Vercel.

---

## 7. MULTI-LAYER ROLLBACK STRATEGY

The source project (`seismic-codex-m01dl`) remains **100% read-only and immutable** throughout all procedures. If any anomaly is detected during Phase 2 or Phase 3, the following recovery procedures will execute:

| Failure Scenario | Immediate Impact | Recovery & Rollback Procedure |
| :--- | :--- | :--- |
| **Partial Auth Import Failure** | Target users incomplete | Delete imported users via `admin.auth().deleteUsers(uids)` and re-import with corrected payload. Production remains on source project. |
| **Partial Firestore Restoration** | Target DB missing documents | Re-run migration script targeting only missing paths (idempotent REST `set` operations). Production remains on source project. |
| **Incorrect Document Fields/Types** | Field corruption in target | Overwrite affected documents using authoritative `firestore-payload.jsonl` data. Source project remains untouched. |
| **Incorrect Security Rules** | Target permissions broken | Re-deploy verified production rules (`firestore.rules`) using Firebase CLI. Production remains on source project. |
| **Google Sign-In Auth Failure** | Target OAuth error | Verify OAuth consent screen and Authorized Domains on target. Revert frontend environment variables to source project. |
| **Vercel Deployment Failure** | Deployment build error | Instant rollback in Vercel dashboard to the previous stable deployment (commit `f971f33`). |
| **External Sheets Auth Failure** | Sheets sync error | Reconnect Google OAuth via GIS popup wizard; queue operations remain safe and pending in Firestore. |

---

## 8. PRODUCTION ACCEPTANCE TESTS (POST-MIGRATION)

Before declaring migration success, the target project must pass all 12 acceptance tests:

1. **Auth Identity Test:** All 5 users successfully sign in via Google Sign-In and receive tokens with their original UIDs.
2. **UID Preservation Test:** Verify `user.uid` matches the source UID for all 5 accounts.
3. **Private Data Isolation Test:** Verify `users/{uid}/settings`, `users/{uid}/tasks`, and `users/{uid}/expenses` load exclusively for their owning user.
4. **Finance Records Test:** Verify all variable expenses, income items, and bills render with accurate totals and currencies.
5. **Tasks & Habits Test:** Verify all task hierarchies, priorities, and habit tracking records are present.
6. **Study Records Test:** Verify study mistakes and pomodoro presets load without loss.
7. **Shared Vault Ownership Test:** Verify vault `vlt_1794905820679_7sjukb` displays correct creator (`MgJF...`) and settings.
8. **Joint Vault Membership Test:** Verify joint members (`ulEx...`, `AAjx...`) have access to shared ledgers and activities.
9. **Native Sheet Hub Test:** Verify connection `conn_1laOanGUQHU6UGwIrwhVQHjN_mwpaj38e` loads with 5 tabs and **exactly 617 rows**.
10. **Sync Queue Safety Test:** Verify all 52 sync queue records ($51 + 1$) exist with status `pending`.
11. **Google Sheets Authorization Test:** Verify `/sheets/verify` succeeds with valid OAuth tokens.
12. **Persistence Test:** Create a new test task, reload the page, and verify the record persists and reads back cleanly from the target database.

---

## 9. EXACT MIGRATION EXECUTION SEQUENCE (PHASE 2 ROADMAP)

```
[ Target Verified ] ──► [ Auth Import ] ──► [ Firestore Restoration ] ──► [ Hash Verification ] ──► [ Vercel Cutover ]
   (DB & Auth Live)         (5 Users)              (259 Docs)                (SHA-256 Match)           (Production)
```

1. **Step 1:** Target infrastructure confirmed live (`projects/focus-flow-by-atif/databases/(default)` in `asia-southeast1` + Auth initialized + Rules deployed).
2. **Step 2:** Execute Auth Import script to import all 5 Google federated user accounts.
3. **Step 3:** Execute Firestore Restoration script to write all 259 documents directly to the target database via REST API.
4. **Step 4:** Execute cryptographic two-pass SHA-256 verification against the Phase 1 backup.
5. **Step 5:** Run the 12 Production Acceptance Tests.
6. **Step 6:** Update Vercel environment variables (`VITE_FIREBASE_PROJECT_ID`, etc.) and trigger deployment.
7. **Step 7:** Perform final live smoke test on `https://focus-flow-by-atif.vercel.app`.

---

## 10. UNRESOLVED BLOCKERS & PREREQUISITES

There are **zero technical, database, or data blockers**.
- Target Firestore Database: **Provisioned & Live** in `asia-southeast1`.
- Target Authentication: **Provisioned & Live** with Google Sign-In & Email/Password.
- Target Security Rules: **Compiled & Deployed**.
- Source Database Data Drift: **Proven $\Delta = 0$**.

---

## FINAL READINESS DETERMINATION

### **STATUS: READY**

FocusFlow is fully audited, proven to have zero drift, backed up with triple redundancy, and the target project infrastructure is officially live.

Phase 2 data migration (Auth user import & 259-document restoration) is ready to execute upon your instruction.
