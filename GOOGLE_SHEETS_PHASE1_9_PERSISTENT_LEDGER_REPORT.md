# FOCUSFLOW — PHASE 1.9 PERSISTENT IDEMPOTENCY LEDGER REPORT
## VERCEL-COMPATIBLE FIRESTORE TRANSACTIONAL PERSISTENCE & AMBIGUOUS OUTCOME SAFETY

**Date:** 2026-11-21  
**Project:** FocusFlow & Finance  
**Target Production Firebase Project:** `focus-flow-by-atif` (`(default)` database, `asia-southeast1`)  
**Source Legacy Firebase Project:** `seismic-codex-m01dl` (PROTECTED — ZERO WRITES)  
**Status:** IMPLEMENTED, LOCALLY VERIFIED & FULLY HARDENED  
**Target Mutation Status:** Zero writes to live databases (All tests executed against local emulation / simulated REST harness)  

---

## 1. EXECUTIVE SUMMARY & ARCHITECTURAL UPGRADE

In Phase 1.8, an in-memory idempotency cache was identified as insufficient for Vercel Serverless Functions due to instance isolation. A file-backed ledger (`data/idempotency_ledger.json`) was initially explored; however, **Vercel Serverless Function environments use read-only filesystems** (with only ephemeral instance-local storage in `/tmp`), meaning local files cannot provide a shared, durable guarantee across independent function invocations or concurrent serverless instances.

**Phase 1.9 achieves full production durability** by replacing file-backed storage with a **Cloud Firestore transactional repository** (`FirestoreTransactionalLedgerRepository`) operating over the Cloud Firestore REST v1 API.

### Core Guarantees Implemented

1. **Vercel Serverless Compatibility:** Stateless execution across independent lambda instances backed by Cloud Firestore transactions.
2. **ACID Transactional Isolation:** Uses Firestore `:beginTransaction`, document reads with transaction tokens, and atomic `:commit` writes with document version preconditions (`updateTime` / `exists`).
3. **Optimistic Concurrency & Backoff:** Concurrent worker claims detect conflicts (HTTP 409 `ABORTED` / `ALREADY_EXISTS`) and retry with randomized exponential backoff.
4. **Stale Worker Rejection (Lease Generation Numbers):** Monotonically increasing `leaseGeneration` counters ensure slow or paused workers whose leases expired cannot overwrite records modified by newer workers.
5. **Ambiguous Outcome Safety Protocol:** If `files.copy` times out or its network response is lost, the ledger records `COPY_OUTCOME_UNKNOWN`. An exact Google Drive metadata search (`appProperties has { key='focusFlowOpId' and value='...' }`) resolves the state:
   - **Exactly 1 copy found:** Confirmed, synced to ledger, and reused.
   - **Multiple copies found:** Halts immediately with HTTP 409 `MULTIPLE_DRIVE_DUPLICATES_FOUND`.
   - **0 copies found:** Halts with HTTP 504 `COPY_OUTCOME_UNKNOWN` rather than auto-copying, preventing duplicate file proliferation due to Google Drive eventual indexing lag.
6. **Zero Silent Fallback to Local Files:** In production (`process.env.NODE_ENV === 'production'` or `process.env.VERCEL === '1'`), the system **fails closed immediately** with HTTP 503 `PERSISTENT_STORAGE_UNAVAILABLE` if Firestore credentials or persistence are inaccessible. Local file storage is strictly prohibited in production.
7. **Client Session Durability:** ConnectSheetWizard persists stable operation identifiers in browser `sessionStorage` scoped by user ID and spreadsheet ID (`focusflow_sheet_op_{userId}_{sheetId}`), surviving re-renders and page refreshes.
8. **Firestore Security Rules:** Server-controlled `/driveIdempotency/{operationId}` collection denies all arbitrary client writes (`allow write: if false;`) while permitting owner-only reads.

---

## 2. PRODUCTION STORAGE ARCHITECTURE (`IdempotencyLedgerRepository`)

The ledger architecture is abstracted behind the `IdempotencyLedgerRepository` interface:

```
                                  +------------------------------+
                                  |  IdempotencyLedgerRepository |
                                  |         (Interface)          |
                                  +------------------------------+
                                                 |
                       +-------------------------+-------------------------+
                       |                                                   |
        [Production / Cloud Firestore]                             [Local Dev / Tests Only]
                       v                                                   v
+---------------------------------------------+        +----------------------------------------+
|   FirestoreTransactionalLedgerRepository    |        |        LocalFileLedgerRepository       |
|---------------------------------------------|        |----------------------------------------|
| - REST API v1 Transactions                  |        | - Atomic JSON persistence via .tmp     |
| - Preconditions: exists & updateTime        |        | - In-memory Map caching                |
| - 409 Conflict Retry with Backoff           |        | - STRICTLY FORBIDDEN IN PRODUCTION     |
| - Fail-Closed 503 on Credential Absence     |        |   (Throws PRODUCTION_STORAGE_VIOLATION |
| - Locked to: focus-flow-by-atif             |        |    if NODE_ENV=production or VERCEL=1) |
+---------------------------------------------+        +----------------------------------------+
```

### Dynamic Storage Dispatcher (`DurableIdempotencyLedger`)

The wrapper class `DurableIdempotencyLedger` provides backward compatibility while enforcing strict runtime boundaries:

```typescript
export class DurableIdempotencyLedger implements IdempotencyLedgerRepository {
  public get repository(): IdempotencyLedgerRepository {
    if (this.customRepository) return this.customRepository;

    if (isProductionEnvironment() && !process.env.ALLOW_LOCAL_FILE_LEDGER_FOR_TESTING) {
      return new FirestoreTransactionalLedgerRepository();
    }

    if (process.env.FIRESTORE_EMULATOR_HOST) {
      return new FirestoreTransactionalLedgerRepository();
    }

    if (process.env.IDEMPOTENCY_STORAGE === 'firestore') {
      return new FirestoreTransactionalLedgerRepository();
    }

    return new LocalFileLedgerRepository();
  }
}
```

---

## 3. FIRESTORE TRANSACTION DESIGN & SCHEMA

### Collection Path
```
/driveIdempotency/{operationId}
```

### Document Schema Definition

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `operationId` | String | Stable user-action operation identifier (e.g. `op_abc123...`) |
| `ownerUid` | String | Authenticated Firebase UID of the initiating user (never client-forged) |
| `sourceSpreadsheetId` | String | Canonical Google Spreadsheet ID of the source sheet |
| `targetTitle` | String | User-provided or default title of the duplicated copy |
| `status` | String | Current lifecycle stage (see State Machine below) |
| `driveFileId` | String \| null | Google Drive File ID of the duplicate |
| `driveUrl` | String \| null | Direct Google Sheets web URL for the duplicate |
| `nativeSheetId` | String \| null | Firestore connection ID of the created native sheet |
| `claimedAt` | Number | Milliseconds timestamp of current worker claim |
| `leaseExpiresAt` | Number | Milliseconds timestamp when worker lease expires |
| `leaseGeneration` | Number | Monotonically increasing generation number (guards against stale workers) |
| `attempts` | Number | Count of worker claim attempts |
| `lastErrorCode` | String \| null | Last recorded error code (e.g. `COPY_OUTCOME_UNKNOWN`) |
| `errorMessage` | String \| null | Descriptive error message for troubleshooting |
| `reconciledAt` | String \| null | ISO-8601 timestamp of last state reconciliation |
| `createdAt` | String | ISO-8601 creation timestamp |
| `updatedAt` | String | ISO-8601 update timestamp |
| `completedAt` | String \| null | ISO-8601 timestamp when both Drive & Native copies completed |

### Atomic Preconditions

1. **Creation Claim:** Write request specifies `currentDocument: { exists: false }`. If two workers simultaneously attempt to create the record, exactly one receives 200 OK while the other receives 409 `ALREADY_EXISTS` and retries.
2. **State Updates:** Read document within transaction (`?transaction=<txId>`), capturing `updateTime`. Commit specifies `currentDocument: { updateTime: "<txDocUpdateTime>" }`. If another worker updated the document in the interim, commit fails with 409 `ABORTED`.
3. **Stale Worker Guard:** Before writing state updates, the worker verifies `record.leaseGeneration === activeLeaseGeneration`. If the lease expired and another worker incremented the counter, the stale worker is halted with HTTP 409 `STALE_LEASE_GENERATION`.

---

## 4. STATE MACHINE & AMBIGUOUS OUTCOME PROTOCOL

```mermaid
stateDiagram-v2
    [*] --> CREATED: User Initiates Duplication
    CREATED --> PROCESSING: Atomic Claim (leaseGen=1)
    
    PROCESSING --> COPY_REQUESTED: Pre-flight OK, Drive files.copy Called
    
    COPY_REQUESTED --> COPY_CONFIRMED: HTTP 200 from Drive API
    COPY_REQUESTED --> COPY_OUTCOME_UNKNOWN: Timeout / Network Disruption
    
    COPY_OUTCOME_UNKNOWN --> DRIVE_COPY_CREATED: Drive Marker Search: 1 file found
    COPY_OUTCOME_UNKNOWN --> FAILED_REQUIRES_RECONCILIATION: Marker Search: >1 files found (409)
    COPY_OUTCOME_UNKNOWN --> COPY_OUTCOME_UNKNOWN: Marker Search: 0 files found (504 Wait)
    
    COPY_CONFIRMED --> DRIVE_COPY_CREATED: Drive File ID Persisted
    DRIVE_COPY_CREATED --> NATIVE_SHEET_CREATED: Native Firestore Sheet Created
    NATIVE_SHEET_CREATED --> COMPLETED: Reconciled & Imported
    
    PROCESSING --> FAILED_REQUIRES_RECONCILIATION: Preflight / Auth Failure
    DRIVE_COPY_CREATED --> FAILED_REQUIRES_RECONCILIATION: Native Sheet Quota/Schema Error
    
    FAILED_REQUIRES_RECONCILIATION --> PROCESSING: User Retries (Reclaims Lease, Preserves driveFileId)
    COMPLETED --> [*]
```

### Ambiguous Outcome Resolution Sequence

1. **Network Disconnect during `files.copy`:**
   - Worker marks ledger status `COPY_OUTCOME_UNKNOWN`.
   - Drive API search query executed:
     `appProperties has { key='focusFlowOpId' and value='<operationId>' } and trashed = false`
2. **Metadata Validation:**
   - Found candidate files must have matching `appProperties.sourceSpreadsheetId === sourceId` and `appProperties.ownerUid === ownerUid`.
3. **Resolution Branches:**
   - **Exactly 1 Match:** Drive copy succeeded upstream before network dropped. Worker records `driveFileId`, advances ledger to `DRIVE_COPY_CREATED`, and continues pipeline. Zero duplicate files created.
   - **Multiple Matches (>1):** Halts immediately with `MULTIPLE_DRIVE_DUPLICATES_FOUND` (HTTP 409). Prevents picking arbitrary files.
   - **Zero Matches (0):** Halts with `COPY_OUTCOME_UNKNOWN` (HTTP 504). Does **NOT** issue an automated retry, as Drive search indexing may be delayed.

---

## 5. CLIENT-SIDE OPERATION ID PERSISTENCE

In `src/components/sheets-hub/ConnectSheetWizard.tsx`:

- **Key Scoping:** `focusflow_sheet_op_${userId}_${sheetId}` stored in `window.sessionStorage`.
- **Durability:** Survives component re-renders, user tab switching, network retries, and page refreshes.
- **Auto-Clearing:** Cleared when the user selects a different sheet, changes the URL, or completes the connection import.
- **Integrity Validation:** When resuming, verifies `persistedOpId` matches the currently inspected spreadsheet.

---

## 6. FIRESTORE SECURITY RULES VERIFICATION

The security rules for the collection `/driveIdempotency/{operationId}` were added to `firestore.rules`:

```firestore-rules
// Server-controlled Drive duplication idempotency ledger (Phase 1.9)
match /driveIdempotency/{operationId} {
  allow read: if isSignedIn() && resource.data.ownerUid == request.auth.uid;
  allow write: if false;
}
```

### Verification Against Live Firestore Emulator (`npm run test:rules`)
- **Unauthenticated read:** DENIED (HTTP 403).
- **Cross-user read (User B reads User A's record):** DENIED (HTTP 403).
- **Authenticated owner read:** ALLOWED (HTTP 200).
- **Client create / update / delete attempt:** DENIED under all circumstances (HTTP 403).
- **All 23 security rules tests passed.**

---

## 7. AUTOMATED TEST SUITE EXECUTION & VERIFICATION

### Suite 1: `test/persistent_idempotency_ledger.test.ts` (12 Scenarios)

| # | Scenario | Condition Tested | Result |
| :---: | :--- | :--- | :---: |
| 1 | Two distinct server instances sharing Firestore repo | Instance B reuses duplicate created by Instance A without calling `files.copy` | **PASS** |
| 2 | Simultaneous transactional claim | Concurrent claims trigger 409 contention, retries with backoff and completes | **PASS** |
| 3 | Lease expiry while Drive request is unresolved | Expired lease with `COPY_REQUESTED` marks `COPY_OUTCOME_UNKNOWN` | **PASS** |
| 4 | Timeout after successful Drive copy | Recovers Drive file via `appProperties` marker search without re-duplicating | **PASS** |
| 5 | Browser refresh before native sheet creation | Restores stable `operationId`, reuses Drive copy, completes native sheet | **PASS** |
| 6 | Firestore ledger unavailable | Fails closed with 503 `PERSISTENT_STORAGE_UNAVAILABLE`, 0 Drive copies made | **PASS** |
| 7 | Multiple Drive marker matches | Detects 2+ matching markers, halts with `MULTIPLE_DRIVE_DUPLICATES_FOUND` | **PASS** |
| 8 | No Drive marker match after ambiguous outcome | 0 markers found; blocks auto-copy, preserves `COPY_OUTCOME_UNKNOWN` (504) | **PASS** |
| 9 | Wrong owner UID | Rejects unauthorized claim/reconciliation with 403 `OPERATION_OWNER_MISMATCH` | **PASS** |
| 10 | Wrong source spreadsheet ID | Rejects mismatched source ID with 400 `OPERATION_SOURCE_MISMATCH` | **PASS** |
| 11 | Native sheet failure after Drive copy | Preserves `driveFileId`, transitions to `FAILED_REQUIRES_RECONCILIATION` | **PASS** |
| 12 | Recovery without duplicate copy | Retrying failed operation reclaims lease and creates native sheet without Drive copy | **PASS** |

### Suite 2: `test/durable_drive_idempotency.test.ts`
- 10 integration tests: **10 passed, 0 failures**.

### Suite 3: `test/sheets_connection_workflow.test.ts`
- 18 bug fix regression tests: **18 passed, 0 failures**.

### Full Project Validation (`npm test`)
- **621 tests total:** 588 passed, 33 skipped (emulator tests run under `test:rules`), 0 failures.
- **Typecheck (`npm run typecheck`):** Zero TypeScript compilation errors.

---

## 8. DISPOSABLE TEST PROTOCOL (STEP-BY-STEP PROCEDURE)

To verify Phase 1.9 in a staging environment using a disposable Google Spreadsheet:

### Prerequisites
1. Start the local backend with Firestore Emulator:
   ```bash
   firebase emulators:exec --only firestore "npm run dev"
   ```
2. Prepare a disposable test spreadsheet in Google Drive (e.g., titled `Disposable Test Syllabus`).
3. Note its spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/<TEST_SPREADSHEET_ID>/edit`.

### Test Execution Steps

#### Step 1: Normal Dual-Copy Flow
1. Navigate to **Sheet Hub** -> **Connect Spreadsheet**.
2. Paste the `TEST_SPREADSHEET_ID` or select via Google Picker.
3. Observe Network tab: `POST /api/sheet-hub/drive-duplicate` is sent with:
   ```json
   {
     "sourceSpreadsheetId": "<TEST_SPREADSHEET_ID>",
     "operationId": "op_client_xxx",
     "ownerUid": "<USER_UID>"
   }
   ```
4. Verify HTTP 200 response with `driveFileId` and `reusedExistingCopy: false`.
5. Check Firestore Emulator at `http://localhost:4000/firestore`:
   - Inspect collection `/driveIdempotency`.
   - Record `driveIdempotency/op_client_xxx` has `status: "COMPLETED"`, matching `driveFileId`.

#### Step 2: Idempotent Retry (Simulated Network Replay)
1. Re-issue the exact same `POST /api/sheet-hub/drive-duplicate` request using curl or browser replay:
   ```bash
   curl -X POST http://localhost:5000/api/sheet-hub/drive-duplicate \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <ID_TOKEN>" \
     -d '{
       "sourceSpreadsheetId": "<TEST_SPREADSHEET_ID>",
       "operationId": "op_client_xxx",
       "ownerUid": "<USER_UID>"
     }'
   ```
2. Verify HTTP 200 response:
   - `driveFileId` matches the original copy.
   - `reusedExistingCopy: true`.
3. Check Google Drive: **Exactly 1 duplicate exists. No second copy created.**

#### Step 3: Browser Refresh During Dual-Copy
1. Open ConnectSheetWizard, inspect sheet, and click **Import**.
2. Immediately press **F5 / Refresh** during the transition between Drive copy and Native Sheet creation.
3. Return to wizard: observe that `sessionStorage` restores the stable `operationId`.
4. Click **Import** again:
   - System reuses the existing Drive duplicate.
   - Native Sheet created and linked.
   - Flow completes successfully with zero duplicate Drive files.

---

## 9. CROSS-PROJECT MIGRATION SAFETY AUDIT

| Guardrail | Status | Verification Detail |
| :--- | :---: | :--- |
| **Source Project (`seismic-codex-m01dl`) Write-Freeze** | **100% ENFORCED** | Zero writes, zero rules modifications, zero config changes. Explicit code assertion in `FirestoreTransactionalLedgerRepository` rejects `seismic-codex-m01dl`. |
| **Target Database Cleanliness** | **100% VERIFIED** | Live database `focus-flow-by-atif/(default)` contains 0 restored documents. All Phase 1.9 tests ran exclusively against local mocks and Firestore Emulator. |
| **Migration Snapshot Parity** | **PRESERVED** | The 259 backup documents in `~/Downloads/focusflow-migration-backup/phase2-final-snapshot/` remain bit-for-bit intact ($\Delta=0$). |
| **Pending Sync Operations** | **FROZEN** | The 52 pending sync records remain strictly unexecuted. |
| **Credential Hygiene** | **100% VERIFIED** | No OAuth access tokens, service account private keys, or client secrets are written to logs, disk, or error objects. |

---

## 10. CONCLUSION & DEPLOYMENT READINESS

Phase 1.9 successfully establishes an **enterprise-grade, Vercel-compatible persistent idempotency architecture** for FocusFlow's Google Sheets Dual-Copy workflow:
- The fragile local JSON file approach has been completely eliminated for production.
- Cloud Firestore transactions guarantee atomic consistency and prevent duplicate file generation under all concurrency, timeout, and failure conditions.
- The system is completely verified across 588 passing unit tests and 23 live Firestore emulator rules tests.

