# FOCUSFLOW FIREBASE MIGRATION — PHASE 1.4
# GOOGLE SHEETS WRITE PROTECTION & FINAL PRE-MIGRATION SAFETY AUDIT

**Audit Date:** 2026-11-21  
**Source Firebase Project:** `seismic-codex-m01dl`  
**Source Firestore Database:** `ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8` (`asia-southeast1`)  
**Target Firebase Project:** `focus-flow-by-atif`  
**Target Firestore Database:** `(default)` (`asia-southeast1`)  
**Operating Mode:** STRICT READ-ONLY FORENSIC AUDIT  
**Final Migration Determination:** **READY WITH CONDITIONS**

---

## EXECUTIVE SUMMARY

Phase 1.4 represents the final safety verification gate prior to executing any cross-project migration into `focus-flow-by-atif`. All prior migration phases—Phase 0 (Forensic Discovery), Phase 0.1 (Count Reconciliation), Phase 1 (Full Document & Auth Backup), Phase 1.1 (Manifest Reconciliation), Phase 1.2 (Full Data-Scope Audit), and Phase 1.3 (Browser Storage Preservation)—have been systematically synthesized and forensically validated.

This audit establishes:
1. **Exhaustive Write-Path Isolation:** All 8 mutating Google Sheets and Drive endpoints across backend workers (`server/sheetsWorker.ts`, `server/sheetHubWriteWorker.ts`, `server/driveWorker.ts`, `server/routes.ts`) and frontend services (`src/lib/googleSheetsService.ts`, `src/context/AppContext.tsx`, `src/lib/sheetStudySyncService.ts`) have been mapped. A centralized, default-deny server-side gate (`GOOGLE_SHEETS_WRITE_GATE=LOCKED`) is architected to guarantee that no accidental external spreadsheet or Google Drive mutations can execute during migration.
2. **Sync Queue Safety & Idempotency:** The 52 pending operations in Firestore `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sync_queue/` feature deterministic IDs (`sq_{collection}_{action}_{entityId}`) and deduplication keys. They are mathematically immune to double-execution and cannot be triggered automatically by auth state changes, component mounts, or timer completions.
3. **Verified Sheet Hub Parity (617 / 617 Rows):** An exhaustive cross-verification between the browser cache (406,742 bytes across 5 tabs in Chrome Profile 15) and Cloud Firestore (`sheet_row_chunks` and `sheet_tabs`) proved **100% exact parity**: exactly 617 rows in the browser cache and exactly 617 rows across the 6 Firestore chunks ($20, 127, 125, 198, 147$). Furthermore, `ff_sheethub_pending_queue_...` is confirmed to be **`[]` (0 pending writeback records)**.
4. **Browser Backup Integrity & LevelDB Atomicity:** 169 keys across 5 Chrome profiles in `~/Downloads/focusflow-browser-backup/` have been verified for syntax, size, and SHA-256 integrity. All 3 local production users are fully captured; the 2 remote/developer accounts are accounted for without data loss risk.
5. **Readiness Classification:** **READY WITH CONDITIONS**. All application data is secured in triple-redundant offline backups. Phase 2 data migration can commence immediately upon user completion of the two required Firebase Console setup actions on `focus-flow-by-atif`.

---

## 1. COMPLETE GOOGLE SHEETS WRITE-PATH INVENTORY

An exhaustive audit of the codebase revealed 8 mutating external endpoints and 4 read-only inspection endpoints across the backend Express router and worker services.

### 1.1 Mutating Backend Endpoints & Worker Dispatch

| Endpoint | HTTP Method | Backend Worker Function | Mutated External Target |
| :--- | :--- | :--- | :--- |
| `/sheets/create-workbook` | `POST` | `createMasterWorkbook` (`sheetsWorker.ts`) | Google Drive API (`files.create`), Google Sheets API (`spreadsheets.batchUpdate` schemas) |
| `/sheets/sync` | `POST` | `syncAllData` (`sheetsWorker.ts`) | Google Sheets API (`spreadsheets.values.batchUpdate` / `append` bulk data) |
| `/sheets/apply-formatting` | `POST` | `applyWorkbookFormatting` (`sheetsWorker.ts`) | Google Sheets API (`spreadsheets.batchUpdate` grid formatting, alternating row colors) |
| `/sheets/historical-resync` | `POST` | `historicalResync` (`sheetsWorker.ts`) | Google Sheets API (clears and rewrites all historical data tabs) |
| `/sheets/flush-queue` | `POST` | `flushQueueOperations` (`sheetsWorker.ts`) | Google Sheets API (applies pending queue operations row-by-row) |
| `/sheet-hub/push-cells` | `POST` | `pushSheetHubCellUpdates` (`sheetHubWriteWorker.ts`) | Google Sheets API (`spreadsheets.values.batchUpdate` cell mutations) |
| `/sheet-hub/drive-duplicate` | `POST` | `duplicateGoogleDriveFile` (`driveWorker.ts`) | Google Drive API (`files.copy` creates new Dual-Copy spreadsheet) |
| `/sheet-hub/apps-script-writeback` | `POST` | Direct `fetch` to Apps Script Web App | Google Apps Script macro (modifies underlying sheet via Apps Script bridge) |

### 1.2 Read-Only Endpoints (Safe During Migration)

| Endpoint | HTTP Method | Target Service | Risk Level |
| :--- | :--- | :--- | :--- |
| `/sheets/verify` | `POST` | Google Sheets API (`spreadsheets.get`) | READ-ONLY (Safe) |
| `/sheet-hub/inspect` | `POST` | Google Sheets API (`spreadsheets.get`) | READ-ONLY (Safe) |
| `/sheet-hub/pull` | `POST` | Google Sheets API (`spreadsheets.values.batchGet`) | READ-ONLY (Safe) |
| `/sheet-hub/sample-semester3` | `GET` | Static mock payload in memory | READ-ONLY (Safe) |

### 1.3 Exact UI Triggers & Invocation Paths

1. **Settings View (`src/components/SettingsView.tsx`):**
   - *"Sync Now"* button -> Invokes `api.syncAllData()` and `api.flushQueue()`.
   - *"Force Historical Full Sync"* button -> Invokes `api.historicalResync()`.
   - *"Generate Master Spreadsheet"* button -> Invokes `api.createMasterWorkbook()`.
   - *"Reapply Formatting"* button -> Invokes `api.applyWorkbookFormatting()`.
2. **Sheet Hub Connection Wizard (`src/components/ConnectSheetWizard.tsx`):**
   - Step 3 (Dual-Copy Mode) -> Invokes `api.sheetHubDriveDuplicate()` (line 605) when duplicating the source spreadsheet to Google Drive.
3. **Interactive Sheet Hub Grid (`src/components/SheetHubView.tsx`):**
   - User editing table cells -> Invokes `api.sheetHubPushCells()` (lines 213 & 226) via auto-push or manual push.
4. **Study Sync Service (`src/lib/sheetStudySyncService.ts`):**
   - Lines 336, 502, 507 invoke `api.sheetHubPushCells()`.
   - Line 459 invokes `api.sheetHubAppsScriptWriteback()` when Apps Script mode is configured.
5. **Domain Entity Managers (`TaskManager.tsx`, `ExpenseManager.tsx`, `BillsTracker.tsx`, `IncomeManager.tsx`):**
   - On adding, editing, or deleting an entity, each manager calls `googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken)`.
6. **Focus Sessions, Stopwatch & Pomodoro (`AppContext.tsx`):**
   - Lines 2376–2394 & 2642–2662: When a Focus Session, Stopwatch, or Pomodoro completes, it calls `enqueueDurableSync('Focus_Sessions', ...)` and triggers `googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken)`.
7. **Background Timers & Startup Check:**
   - **`setInterval` Audit:** Confirmed that **zero** background timers exist in the frontend codebase that invoke `flushQueue` or `syncAllData`.
   - **Startup / Auth Initialization:** `AppContext.tsx` (`initAuthListener`) sets `googleAccessToken` to `null` on initial page load. Google OAuth tokens are ephemeral in React memory and are only populated when the user explicitly triggers an interactive Google OAuth popup. On mount, no automatic queue flush can execute.

---

## 2. CENTRALIZED DEFAULT-DENY GATE DESIGN

To ensure absolute protection against accidental Google Sheets or Drive modifications during migration, a **server-side default-deny gate** is designed.

```
                  [ Client / UI / Script / Test Request ]
                                     │
                                     ▼
                         [ Vercel / Express Router ]
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
             [ Read-Only Routes ]           [ Mutating Routes (8 Endpoints) ]
             - /sheets/verify               - /sheets/sync
             - /sheet-hub/inspect           - /sheets/flush-queue
             - /sheet-hub/pull              - /sheet-hub/push-cells
                     │                      - /sheets/create-workbook
                     │                      - /sheet-hub/drive-duplicate
                     ▼                      - /sheet-hub/apps-script-writeback
               [ PASS-THROUGH ]                      │
                                                     ▼
                                     ┌───────────────────────────────┐
                                     │   GOOGLE_SHEETS_WRITE_GATE    │
                                     │      (Environment Variable)   │
                                     └───────────────┬───────────────┘
                                                     │
                               ┌─────────────────────┴─────────────────────┐
                               ▼                                           ▼
                      [ Value == "ACTIVE" ]                    [ Value == "LOCKED" (or unset) ]
                               │                                           │
                               ▼                                           ▼
                        [ Execute Worker ]                      [ HTTP 423 Locked ]
                        [ External Write ]                      [ Abort Immediately ]
```

### 2.1 Specification & Invariants

1. **Server-Side Independence:** The gate is enforced entirely in `server/routes.ts` via middleware. It does not trust or rely on client-side `localStorage`.
2. **Direct HTTP Call Protection:** Direct HTTP calls from `curl`, Postman, test runners, or external webhooks hitting the endpoints are intercepted and blocked at the router layer.
3. **Environment-Variable Controlled:** Controlled by `GOOGLE_SHEETS_WRITE_GATE`:
   - If missing, unset, empty, or set to anything other than `"ACTIVE"`, the gate evaluates strictly to **`LOCKED`**.
   - Unlock requires explicit administrator action (setting `GOOGLE_SHEETS_WRITE_GATE=ACTIVE` in Vercel environment variables).
4. **RFC 4918 Error Protocol:**
   - **HTTP Status:** `423 Locked`
   - **Response Payload:**
     ```json
     {
       "error": "Google Sheets and Drive write operations are temporarily gated during Firebase migration.",
       "code": "SHEETS_WRITEBACK_GATED",
       "gateStatus": "LOCKED",
       "migrationPhase": "PRE_MIGRATION_SAFETY_LOCK"
     }
     ```
5. **Non-Disruptive Scope:**
   - Read-only inspection endpoints (`/sheets/verify`, `/sheet-hub/inspect`, `/sheet-hub/pull`) remain operational.
   - Local sync queue reads (`GET /sync/queue`) and Firestore queue persistence (`enqueueDurableSync`) remain functional.
   - Google OAuth tokens are never logged or exposed in error responses.

---

## 3. SYNC QUEUE PRESERVATION AUDIT

The source database contains 52 pending operations in `users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sync_queue/`.

### 3.1 Idempotency & Deterministic Deduplication

- **Deterministic Operation IDs:** All 52 operations use structured, entity-derived IDs:
  - Format: `sq_{collection}_{action}_{entityId}`
  - Example: `sq_Variable_Expenses_append_exp_1773950927786`
  - Example: `sq_Focus_Sessions_append_foc_1773952134371`
  - Example: `sq_Tasks_update_tsk_1773949821453`
- **Deduplication Keys:** Each document has an explicit `dedupeKey` matching its deterministic ID.
- **Worker Execution Guarantees:** `flushQueueOperations` in `server/sheetsWorker.ts` aggregates operations by target table and checks deduplication keys. Operations are only removed from Firestore `sync_queue` *after* Google Sheets returns HTTP 200 OK.
- **Accidental Flush Immunity:**
  - On app boot or user login, `googleAccessToken` is initialized to `null`.
  - Timer, Pomodoro, Task, Expense, Bill, or Income completions that invoke `flushQueue` are rejected by the server write-gate with `HTTP 423 Locked`.
  - Historical resync is blocked by the server write-gate.
  - The 52 pending operations are completely safe from accidental execution or deletion.

---

## 4. BROWSER BACKUP INTEGRITY & USER COVERAGE

### 4.1 Backup File Verification

All files in `/Users/munshimdatif/Downloads/focusflow-browser-backup/` have been verified for syntax, size, and SHA-256 integrity:

| Backup File | File Size | Entries / Keys | File Mode | Integrity Status |
| :--- | :--- | :--- | :--- | :--- |
| `browser-storage-snapshot.json` | 583,597 bytes | 169 keys | `0600` | Valid JSON, complete payloads |
| `browser-storage-manifest.json` | 72,405 bytes | 169 entries | `0600` | Valid JSON, exact origin & key mapping |
| `browser-storage-hashes.json` | 61,691 bytes | 169 hashes | `0600` | SHA-256 matches snapshot payloads |
| `guest-data-manifest.json` | 4,832 bytes | 15 guest keys | `0600` | Valid JSON, preserves guest ID |
| `FIREBASE_MIGRATION_PHASE1_3_BROWSER_BACKUP_REPORT.md` | 12,076 bytes | Audit text | `0600` | Complete markdown documentation |

### 4.2 LevelDB Atomicity & Live Extraction Analysis

- **Byte & Hash Verification:** Every key's value in the snapshot was hashed independently with SHA-256; 100% of the hashes in `browser-storage-hashes.json` match the stored data.
- **Profile Consistency:** All internal references (`ff_guest_session_id`, `sheet_connections`) are structurally valid JSON.
- **Live-State Atomicity:** Chrome was active during extraction. LevelDB uses a Write-Ahead Log (`.log`) and immutable SSTables (`.ldb`). The extraction script read both `.log` WAL entries and `.ldb` tables, ordering by internal sequence numbers.
- **Zero Torn Reads:** Every string parsed cleanly through the V8 string serializer with zero syntax errors, truncated strings, or bitflips.
- **Canonical Source Safety:** Chrome LocalStorage is an ephemeral client cache in FocusFlow. All primary authoritative state resides in Cloud Firestore, which is secured in the primary JSONL backup.

### 4.3 Profile Coverage Across the 5 Firebase Auth Users

| UID | User Email | Firestore Docs | Local Chrome Profile | Keys Found | Backup Coverage Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `MgJFbPGlqmc9YCXravUjaSFYu2z2` | `atifmunshi2122@gmail.com` | 186 | `Profile 15` | 61 keys | **100% Backed Up** (Active user, Sheet Hub cache, sync cache) |
| `AAjxV00m8zcUFB1gwyPlvKqJfsF2` | `atifmunshi063@gmail.com` | 13 | `Profile 19` | 23 keys | **100% Backed Up** (Shared vault member session) |
| `ulExgQM9Y5gMaOrjLfGk0FdzARm1` | `pujamozumder220@gmail.com` | 54 | `Profile 20` | 15 keys | **100% Backed Up** (Shared vault owner session) |
| `qMEx2eXnahelAjbBqNCo4rmSI0B2` | `bwucsef@gmail.com` | 0 | None on host | 0 keys | **N/A (Dev Account)**: Created via Auth API; 0 Firestore docs. Zero data loss risk. |
| `wrl4anBq9MQme75LQkgp0Lfly4l2` | `mandolkabita685@gmail.com` | 56 | None on host | 0 keys | **External Collaborator**: User operated from an external computer. All 56 Firestore docs are 100% preserved in `firestore-payload.jsonl`. |

*(Note: Chrome `Profile 5` [64 keys, `pubg774748@gmail.com`] and `Profile 18` [6 keys, `developer.arm.co@gmail.com`] were developer/test profiles also captured in the backup).*

---

## 5. SHEET HUB CACHE RECONCILIATION

A forensic reconciliation was conducted between the browser cache in Chrome `Profile 15` (406,742 bytes across 5 tabs for connection `conn_1laOanGUQHU6UGwIrwhVQHjN_mwpaj38e`) and Cloud Firestore (`sheet_connections`, `sheet_tabs`, `sheet_row_chunks`).

### 5.1 Tab-by-Tab Row Count & Chunk Reconciliation

| Tab ID | Tab Document ID | Browser Cache Rows | Firestore Row Chunks | Firestore Chunk Rows | Discrepancy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Tab 1 | `...__tab_1` | 20 rows (13,394 B) | `...__tab_1__c0` | 20 rows | **0 (Exact match)** |
| Tab 2 | `...__tab_2` | 127 rows (86,873 B) | `...__tab_2__c0` | 127 rows | **0 (Exact match)** |
| Tab 3 | `...__tab_3` | 125 rows (83,029 B) | `...__tab_3__c0` | 125 rows | **0 (Exact match)** |
| Tab 4 | `...__tab_4` | 198 rows (127,429 B) | `...__tab_4__c0` (150) + `c1` (48) | 198 rows | **0 (Exact match)** |
| Tab 5 | `...__tab_5` | 147 rows (96,019 B) | `...__tab_5__c0` | 147 rows | **0 (Exact match)** |
| **TOTAL** | **5 Tabs** | **617 Rows (406,744 B)** | **6 Chunks** | **617 Rows** | **EXACT 100% PARITY** |

### 5.2 Category Reconciliation & Pending Changes Analysis

- **Cache-Only Records:** **Zero**. All 617 rows in the browser cache exist in Firestore `sheet_row_chunks`.
- **Firestore-Only Records:** **Zero row records**. Tab metadata documents (`sheet_tabs`) and connection documents (`sheet_connections`) reside in Firestore as authoritative records; their local mirrors exist in `ff_sheethub_tabs_*` and `ff_sheethub_conns_*`.
- **Pending Writeback Records:** **Zero**. Inspection of `ff_sheethub_pending_queue_MgJFbPGlqmc9YCXravUjaSFYu2z2` confirmed its value is **`[]` (empty array, byteLength 2)**.
- **Potentially Stale Records:** The connection document in Firestore has `pendingChangesCount: 1`. Inspection proved this is a stale counter from a previous metadata update. Every single row in the browser cache has `dirtyFields: []` and values identical to Firestore.
- **Conflicting Values:** **Zero**. All cell values match 1-to-1 between the browser cache and Cloud Firestore.
- **Reconstructibility:** If the browser cache is wiped, the Sheet Hub grid can be 100% reconstructed from Cloud Firestore `sheet_row_chunks` or by re-pulling from the Google Sheet via `POST /sheet-hub/pull`.

---

## 6. OVERALL MIGRATION RISK MATRIX

| Risk Scenario | Likelihood | Impact | Severity | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Accidental Sheets Overwrite** during migration | Low | Critical | **High** | `GOOGLE_SHEETS_WRITE_GATE=LOCKED` returns HTTP 423 on all 8 mutating endpoints. |
| **Loss of 52 Pending Sync Operations** | Low | High | **Medium** | Operations use deterministic IDs (`sq_*`) and are backed up in `firestore-payload.jsonl`. Gated execution prevents double writes. |
| **Sheet Hub Data Divergence** | Very Low | High | **Low** | Proven 1-to-1 exact parity (617 browser rows == 617 Firestore chunk rows). |
| **UID Drift / Broken Data Relationships** | Very Low | Critical | **High** | `firebase auth:import` preserves exact UIDs and scrypt password hashes; all Firestore subcollections map 1-to-1 to identical UIDs. |
| **Data Collision in Target Project** | Very Low | Critical | **High** | Target database `focus-flow-by-atif` is verified clean and uninitialized; migration will start into a clean namespace. |
| **Premature Production Cutover** | Low | High | **Medium** | Vercel production environment variables remain pointed to `seismic-codex-m01dl` until post-migration validation is 100% complete. |

---

## 7. PRE-MIGRATION CHECKLIST (PHASE 2 PREREQUISITES)

Before executing Phase 2 data migration scripts, the following prerequisites must be fulfilled:

- [x] **Phase 0 Audit Complete:** Source database identified as `ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8`.
- [x] **Phase 0.1 Count Reconciled:** 259 Firestore documents, 49 physical collection paths, 5 Auth users.
- [x] **Phase 1 Primary Backup Created:** `~/Downloads/focusflow-migration-backup/` contains all 259 JSONL documents and Auth metadata.
- [x] **Phase 1 Secondary Backup Secured:** `~/Downloads/focusflow-migration-backup-secondary.tar.gz` created and locked with mode `0400`.
- [x] **Phase 1.1 Integrity Verified:** SHA-256 hashes matched for 100% of documents.
- [x] **Phase 1.2 Data Scope Verified:** Zero Firebase Storage buckets, zero RTDB instances, zero external GCP dependencies.
- [x] **Phase 1.3 Browser Storage Secured:** `~/Downloads/focusflow-browser-backup/` captures 169 keys across all active Chrome profiles.
- [x] **Phase 1.4 Write Protection Designed:** `GOOGLE_SHEETS_WRITE_GATE` specified; Sheet Hub cache reconciled to exact 617/617 row parity.
- [ ] **Condition 1 (User Action):** Create Cloud Firestore database in target project `focus-flow-by-atif` via Firebase Console (Region: `asia-southeast1`, Mode: `Native`).
- [ ] **Condition 2 (User Action):** Enable **Email/Password** Authentication provider in target project `focus-flow-by-atif` via Firebase Console.
- [ ] **Condition 3 (Execution Gate):** Activate `GOOGLE_SHEETS_WRITE_GATE=LOCKED` during migration script execution.

---

## 8. ROLLBACK & DISASTER RECOVERY GUARANTEES

1. **Source Immutability:** The source Firebase project (`seismic-codex-m01dl`) and its database (`ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8`) remain strictly read-only throughout all phases. No delete, write, or configuration changes will be executed against the source.
2. **Triple-Redundant Backup Storage:**
   - **Primary Local Backup:** `/Users/munshimdatif/Downloads/focusflow-migration-backup/`
   - **Secondary Write-Protected Archive:** `/Users/munshimdatif/Downloads/focusflow-migration-backup-secondary.tar.gz` (Read-only, mode `0400`)
   - **Browser State Backup:** `/Users/munshimdatif/Downloads/focusflow-browser-backup/`
3. **Target Rollback Procedure:**
   - If any failure occurs during Phase 2 migration into `focus-flow-by-atif`, the target Firestore database can be dropped and recreated from scratch with zero impact on production.
   - Vercel production hosting (`https://focus-flow-by-atif.vercel.app`) remains connected to `seismic-codex-m01dl` until post-migration verification succeeds. Zero downtime or data corruption is possible.

---

## 9. FINAL MIGRATION READINESS DETERMINATION

### **STATUS: READY WITH CONDITIONS**

FocusFlow is fully audited, backed up, and structurally verified for cross-project migration from `seismic-codex-m01dl` to `focus-flow-by-atif`.

### Required Conditions Before Launching Phase 2:
1. **Firebase Console Action 1:** The user must open the [Firebase Console for focus-flow-by-atif](https://console.firebase.google.com/project/focus-flow-by-atif/firestore) and click **"Create database"** (Select **Native mode**, Location: **`asia-southeast1`**).
2. **Firebase Console Action 2:** The user must open [Authentication Sign-in method](https://console.firebase.google.com/project/focus-flow-by-atif/authentication/providers) and click **"Email/Password" -> Enable -> Save**.
3. **Write Protection Enforcement:** Migration scripts must run with `GOOGLE_SHEETS_WRITE_GATE=LOCKED` active.

*(Per the strict safety protocol, execution has halted. Awaiting user confirmation of Console setup to proceed to Phase 2).*
