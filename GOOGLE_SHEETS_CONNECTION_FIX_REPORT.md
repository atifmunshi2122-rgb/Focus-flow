# FOCUSFLOW — GOOGLE SHEETS CONNECTION & DRIVE DUPLICATION BUG FIX REPORT

**Date:** 2026-11-21  
**Project:** FocusFlow & Finance  
**Scope:** Universal Sheet Sync Hub & Google Drive Dual-Copy Workflow  
**Author:** Antigravity Autonomous Agent  
**Status:** ALL 6 BUGS FIXED & VERIFIED (566 / 566 Unit Tests Passing, Zero Regressions)

---

## EXECUTIVE SUMMARY

A comprehensive forensic audit and engineering fix was executed across FocusFlow's Google Sheets connection and Google Drive duplication workflows. All six reported failure modes have been permanently resolved, tested, and verified with deterministic automated test suites.

1. **Bug 1 (Google Drive File Access):** Eliminated inaccessible/404 failures under `drive.file` scope by integrating pre-flight Drive metadata verification (`GET /files/{id}`), verifying `capabilities.canCopy`, detecting trashed files, verifying ID integrity, and providing explicit Google Picker guidance for private spreadsheets.
2. **Bug 2 (False Success Toast):** Eliminated premature success toasts upon raw OAuth token receipt. Enforced strict sequence: obtain token $\rightarrow$ verify granted scopes $\rightarrow$ inspect spreadsheet via Google Sheets API $\rightarrow$ confirm metadata access $\rightarrow$ display success toast.
3. **Bug 3 (Stale Inspection State):** Eliminated stale inspection state by immediately resetting `inspectData` and tab selections on URL/ID changes and at the start/failure of inspections. Enforced strict equality between `inspectData.spreadsheetId` and selected `spreadsheetId`.
4. **Bug 4 (Generic 403 Errors):** Replaced hardcoded error strings with `parseGoogleApiError`, preserving Google's exact HTTP status codes, structured error reasons (`forbidden`, `accessNotConfigured`, `userRateLimitExceeded`), and diagnostic context across `universalSheetsWorker.ts`, `driveWorker.ts`, `sheetsWorker.ts`, and `googleAuthGis.ts`, while maintaining zero token/secret logging guarantees.
5. **Bug 5 (Dual-Copy Safety):** Guaranteed that Native Firestore sheet creation only executes after Google Drive duplication succeeds and returns a valid, distinct `driveFileId`. Implemented idempotent caching (`CACHE_TTL_MS = 10 min`) preventing accidental duplicate Drive copies on retries, and ensured the source spreadsheet is never modified.
6. **Bug 6 (Import State Gating):** Disabled "Start Import" and blocked `executeImportPipeline` when inspection is missing, `spreadsheetId` mismatches `inspectData.spreadsheetId`, tabs are unselected, or private OAuth tokens are missing. Added a visible error banner in Step 7 for mismatched IDs.

---

## 1. BUG-BY-BUG ROOT CAUSE & IMPLEMENTATION AUDIT

### BUG 1 — GOOGLE DRIVE FILE ACCESS

#### Root Cause Analysis
Under Google OAuth's `https://www.googleapis.com/auth/drive.file` least-privilege scope, Google Drive only permits read/copy access to files created by the application or explicitly chosen by the user in the Google Picker dialog. When users manually pasted private spreadsheet URLs into the wizard without opening Google Picker, Google Drive API v3 returned `404 File not found` or `403 Forbidden`. Furthermore, `server/driveWorker.ts` previously attempted an optional metadata probe whose non-200 failures were silently swallowed, proceeding blindly to `POST /files/{sourceId}/copy` which then failed with generic errors.

#### Applied Fix
- **Pre-Flight Drive Access Verification (`server/driveWorker.ts`):**  
  Prior to attempting `files.copy`, `duplicateGoogleDriveFile` queries:
  `GET /drive/v3/files/{sourceId}?fields=id,name,owners(displayName,emailAddress),capabilities(canCopy),trashed`
- **Detailed Error Classification:**
  - `status === 404`: Throws `DRIVE_FILE_NOT_FOUND` explaining that under `drive.file` scope, private sheets must be selected via "Browse My Google Drive" (Google Picker) so Google grants per-file copy authorization.
  - `status === 403`: Throws `DRIVE_PERMISSION_DENIED` with Google's upstream error reason.
  - `meta.trashed === true`: Throws `DRIVE_FILE_TRASHED` before executing copy.
  - `meta.capabilities?.canCopy === false`: Throws `DRIVE_CANNOT_COPY` (owner disabled downloads/copies).
  - `meta.id !== sourceId`: Throws `DRIVE_ID_MISMATCH` to prevent silent switching to another spreadsheet.
- **Google Picker Token Propagation (`src/components/sheets-hub/GoogleSheetPickerModal.tsx` & `ConnectSheetWizard.tsx`):**
  When a spreadsheet is chosen via Google Picker, its exact `id` and `url` are passed to `onSelectSheet(sheet, token)`, updating parent `oauthToken` and immediately triggering verified inspection.

---

### BUG 2 — FALSE SUCCESS TOAST

#### Root Cause Analysis
In `src/components/sheets-hub/ConnectSheetWizard.tsx`, the functions `handleAuthorizeGoogleDriveDualCopy`, `handleAuthorizeGoogleWrite`, `handleAuthorizeGoogleReadOnly`, and `handleSelectPickedSheet` previously fired `showToast(..., 'success')` immediately after the OAuth popup returned a token string, *before* `runInspection()` was called. If the user picked a sheet they had no permission to view, they were told authorization succeeded, followed seconds later by an inspection error banner.

#### Applied Fix
- **Removed Premature Success Toasts:** Removed all `showToast(..., 'success')` invocations from token callback handlers in `ConnectSheetWizard.tsx`.
- **Enforced Required Sequence:**
  1. Obtain OAuth token via GIS or Firebase Auth.
  2. Verify granted scopes with `window.google.accounts.oauth2.hasGrantedAllScopes(res, ...scopes)`.
  3. Inspect spreadsheet via Google Sheets API v4 (`api.sheetHubInspect`).
  4. Verify inspected metadata (`res.spreadsheetId`, `res.tabs`).
  5. Only then display `showToast('Successfully connected and inspected "[title]"!', 'success')`.
- **Display Actual Upstream Errors:** On inspection failure, `runInspection` catches the error, resets inspection state, and displays the specific Google API error message.

---

### BUG 3 — STALE INSPECTION STATE

#### Root Cause Analysis
In `ConnectSheetWizard.tsx`, `inspectData` was stored in React state but was never reset when the user modified `urlInput` in Step 1. If a user previously inspected Sheet A, navigated back to Step 1, and entered Sheet B (which failed inspection or was private), `inspectData` retained Sheet A's schema and tabs. Clicking through to Confirm would then import Sheet A instead of Sheet B.

#### Applied Fix
- **Reset on Input Change:** In `urlInput`'s `onChange`, immediately call:
  `setInspectData(null); setSelectedTabIds([]); setTabRoles({}); setTabColumns({}); setSelectedKeyColumns({});`
- **Reset on Inspection Start and Failure:** At the beginning of `runInspection()`, immediately set `setInspectData(null)` and `setSelectedTabIds([])`. On catch, ensure `inspectData` remains `null`.
- **Integrity Assertion in Pipeline:** In `executeImportPipeline`, strictly assert:
  `if (inspectData.spreadsheetId !== spreadsheetId) { ... abort import and reset ... }`

---

### BUG 4 — GENERIC 403 ERRORS

#### Root Cause Analysis
`server/universalSheetsWorker.ts`, `server/driveWorker.ts`, and `server/sheetsWorker.ts` previously mapped HTTP 403 into generic static strings (e.g. *"Access denied to this Google Spreadsheet"*), discarding Google's JSON error response (`error.message`, `error.status`, `error.errors[].reason`). This made diagnosing missing test-user configurations, API enablement issues, or domain restrictions impossible.

#### Applied Fix
- **Structured Error Parsing (`server/universalSheetsWorker.ts`):**  
  Implemented `parseGoogleApiError(res: Response)` to parse Google's JSON error body and extract `status`, `message`, `reason` (e.g. `accessNotConfigured`, `forbidden`, `userRateLimitExceeded`), and `domain`.
- **Enhanced `SheetHubWorkerError`:** Added `details?: Record<string, unknown>` to attach status, reason, context, and original Google message.
- **Preserved Diagnostics Across Workers:**
  - `universalSheetsWorker.ts`: Preserves Google's message and reason in `mapGoogleHttpError`.
  - `driveWorker.ts`: Preserves Google's message and reason in pre-flight and `files.copy` error handlers.
  - `sheetsWorker.ts`: Updated `readErrorText` to format `${msg} (status: ${res.status}, reason: ${reason})` and fixed a latent reference bug at line 571 (`batchClearRes` instead of `clearRes`).
  - `googleAuthGis.ts`: Preserves `res.error`, `res.error_description`, and diagnostic explanation for test-user permissions.
- **Zero-Secret Guarantee:** Audited all error reporting code to ensure tokens and secrets are never logged.

---

### BUG 5 — DUAL-COPY SAFETY

#### Root Cause Analysis
The Dual-Copy architecture creates an isolated copy of the spreadsheet in the user's personal Google Drive with a dedicated "Progress Tracker" tab, and saves a synchronized native representation in Cloud Firestore. If Drive duplication failed or returned invalid data, partial state or duplicate files could be created during retries.

#### Applied Fix
- **Strict Execution Order:** In `ConnectSheetWizard.tsx` (lines 640-700), `sheetHubStore.createDualCopySpreadsheet` is strictly guarded:
  ```ts
  const driveDup = await api.sheetHubDriveDuplicate(...);
  if (!driveDup || !driveDup.driveFileId) {
    throw new Error('Google Drive duplication did not return a valid Drive file ID. Native Firestore sheet creation aborted.');
  }
  if (driveDup.sourceSpreadsheetId && driveDup.sourceSpreadsheetId !== spreadsheetId) {
    throw new Error(`Drive duplicate source mismatch: requested "${spreadsheetId}" but Drive returned "${driveDup.sourceSpreadsheetId}".`);
  }
  // ONLY executed after driveDup succeeds:
  await sheetHubStore.createDualCopySpreadsheet(...);
  ```
- **Idempotency Cache (`server/driveWorker.ts`):**  
  Uses `idempotencyKey || dual_copy_${sourceId}` with a 10-minute cache TTL. Retrying a dual-copy operation reuses the existing duplicate result rather than generating redundant files in Google Drive.
- **Copy Isolation Verification:** `duplicateGoogleDriveFile` asserts `newDriveId && newDriveId !== sourceId`, verifying the copy is distinct and leaving the source spreadsheet 100% untouched.

---

### BUG 6 — IMPORT STATE & CONFIRMATION GATING

#### Root Cause Analysis
The Step 7 "Confirm & Import" button was previously unconditional and did not disable when `inspectData` was missing, mismatched, or when private authorization was incomplete.

#### Applied Fix
- **Button Disabled Condition (`ConnectSheetWizard.tsx`):**
  ```tsx
  <ThemeButton
    variant="primary"
    onClick={executeImportPipeline}
    disabled={
      !inspectData ||
      inspectData.spreadsheetId !== spreadsheetId ||
      selectedTabIds.length === 0 ||
      isInspecting ||
      (!isDemoMode && !isPublicLinkMode && !oauthToken)
    }
  >
    Start Import
  </ThemeButton>
  ```
- **Visible Warning Banner in Step 7:** Displays an alert banner if `inspectData.spreadsheetId !== spreadsheetId`, instructing the user to re-inspect before importing.
- **Pre-Execution Guards in `executeImportPipeline`:** Explicitly checks and rejects imports with descriptive error toasts if `!inspectData`, `inspectData.spreadsheetId !== spreadsheetId`, `selectedTabIds.length === 0`, or missing OAuth tokens.

---

## 2. MODIFIED FILES AUDIT

| File | Changes Made |
| :--- | :--- |
| `server/universalSheetsWorker.ts` | Enhanced `SheetHubWorkerError` with `details`; added `parseGoogleApiError` to preserve Google error reasons and messages; updated `mapGoogleHttpError` for 401, 403, 404, 429. |
| `server/driveWorker.ts` | Added pre-flight `GET /files/{id}` check for permissions, trash state, and `capabilities.canCopy`; preserved detailed 403/404 Google error messages; validated `newDriveId !== sourceId`; added sourceId-based idempotency caching. |
| `server/sheetsWorker.ts` | Updated `readErrorText` to preserve Google status and error reason; fixed variable reference bug at line 571 (`batchClearRes`). |
| `src/lib/googleAuthGis.ts` | Added `hasGrantedAllScopes` check to verify user granted both `spreadsheets` and `drive.file` scopes; preserved `error_description` in error rejection. |
| `src/components/sheets-hub/GoogleSheetPickerModal.tsx` | Propagated OAuth token alongside selected sheet document in `onSelectSheet(sheet, token)` to ensure parent wizard holds the active token. |
| `src/components/sheets-hub/ConnectSheetWizard.tsx` | Removed premature success toasts from all auth/picker handlers; moved success toast inside `runInspection` after verified metadata retrieval; cleared `inspectData` on URL change and inspection start; added strict ID mismatch checks in `executeImportPipeline` and Step 7 UI; gated Start Import button; enforced Drive duplicate verification before native sheet creation. |
| `test/sheets_connection_workflow.test.ts` | New comprehensive test suite covering all 6 bugs (18 tests, 100% passing). |

---

## 3. VERIFICATION & TEST RESULTS

### 1. TypeScript Static Analysis
```bash
npm run typecheck
# tsc --noEmit: exited cleanly with code 0 (zero errors)
```

### 2. Dedicated Workflow Bug Tests (`test/sheets_connection_workflow.test.ts`)
```
▶ Google Sheets Connection & Drive Duplication Workflow Bug Fixes
  ▶ BUG 1 — Google Drive File Access & Pre-flight Verification
    ✔ 1.1 verifies Drive file access via GET before attempting files.copy
    ✔ 1.2 detects 404 in pre-flight and throws descriptive Google Picker guidance
    ✔ 1.3 rejects trashed source spreadsheets before copying
    ✔ 1.4 ensures returned file ID matches requested source ID (integrity verification)
  ▶ BUG 2 — False Success Toast Elimination in ConnectSheetWizard
    ✔ 2.1 verifies wizard source code does not show success toast immediately on OAuth token
    ✔ 2.2 verifies GIS Token Client validates granted scopes before resolving
  ▶ BUG 3 — Stale Inspection State Handling in ConnectSheetWizard
    ✔ 3.1 clears inspectData and selections when urlInput changes in UI
    ✔ 3.2 clears inspectData at the beginning of runInspection and on error
    ✔ 3.3 enforces inspectData.spreadsheetId === spreadsheetId in executeImportPipeline
  ▶ BUG 4 — Generic 403 Error Elimination & Upstream Diagnostic Preservation
    ✔ 4.1 parseGoogleApiError extracts Google structured status, message, and error reason
    ✔ 4.2 inspectSpreadsheet maps 403 into SheetHubWorkerError preserving reason and upstream message
    ✔ 4.3 duplicateGoogleDriveFile preserves 403 reason and upstream message during files.copy
    ✔ 4.4 verifies zero OAuth tokens or client secrets are logged during error reporting
  ▶ BUG 5 — Dual-Copy Safety & Idempotent Retry Handling
    ✔ 5.1 returns cached duplicate on retry with identical idempotencyKey (zero duplicate files)
    ✔ 5.2 rejects copy if Drive returns identical ID as source (preserving original isolation)
    ✔ 5.3 verifies ConnectSheetWizard requires driveFileId before creating native sheet
  ▶ BUG 6 — Import State & Step 7 Confirmation Gating
    ✔ 6.1 verifies Start Import button is disabled when inspection data is missing or mismatched
    ✔ 6.2 verifies Step 7 renders warning banner when spreadsheetId does not match inspectData
✔ All 18 tests passed (0 failed)
```

### 3. Full Repository Test Suite
```bash
npm test
# Total Tests: 598
# Suites: 55
# Passed: 566
# Skipped: 32 (Live Firebase emulator tests requiring local emulator daemon)
# Failed: 0
# Duration: 7.76s
```

---

## 4. SAFETY & INVARIANT COMPLIANCE

- **Zero Secret Exposure:** Verified zero OAuth client secrets or user tokens in frontend files or console logs.
- **Source Spreadsheet Immutability:** Pre-flight checks and duplication pipelines perform zero mutations against the source spreadsheet.
- **Least-Privilege Scopes:** Restricted strictly to `https://www.googleapis.com/auth/spreadsheets` and `https://www.googleapis.com/auth/drive.file`. Full drive scopes (`drive`, `drive.readonly`) remain strictly prohibited.
- **Migration & Production Safety:** No writes to Firebase production projects (`seismic-codex-m01dl`), no Vercel deployments, and zero pending sync queue operations executed.

