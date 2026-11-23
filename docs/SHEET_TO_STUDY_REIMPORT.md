# Sheet Hub → Study OS Re-import, Conflict Handling & History Management

**Document:** `SHEET_TO_STUDY_REIMPORT.md`  
**Phase:** Step 5 — Import History, Re-import and Conflict Handling  
**Target Version:** FocusFlow & Finance v1.8.0  
**Status:** Implemented, Fully Tested & Verified (11/11 Re-import Tests, 47/47 Import Suite Tests, 788/788 Workspace Tests)  
**Related Documents:** `SHEET_TO_STUDY_AUDIT.md`, `SHEET_TO_STUDY_MAPPING_DESIGN.md`, `SHEET_TO_STUDY_DATA_MODEL.md`, `SHEET_TO_STUDY_PREVIEW_UI.md`, `SHEET_TO_STUDY_REIMPORT_RULES.md`, `SHEET_TO_STUDY_IMPORT_ENGINE.md`

---

## 1. Executive Summary

In Step 5, the end-to-end management experience for importing Google Spreadsheets into Study OS has been finalized. The system provides:

1. **Persistent Audit History:** Logs every import run chronologically with source name, target tier, selected tabs, created/merged counts, duplicate rows, invalid rows, theory completed, date, and execution status.
2. **Re-import Recognition & Change Reconciliation:** Recognizes previously imported spreadsheets and allows re-importing without duplicating subjects or topics.
3. **Conflict & Change Preview:** Highlights new topics, unchanged topics, changed source content, potential spreadsheet duplicates, and missing source rows prior to executing imports.
4. **Source Management Hub:** Dedicated UI modal allowing users to view history logs, inspect tracked syllabus sources, trigger 1-click re-imports, stop tracking sources, or remove tracking metadata without deleting any Study OS subjects, topics, or progress.
5. **Idempotent Failure Recovery:** Automatically handles partial failures, displaying clear error diagnostics and enabling safe retries that never duplicate already committed records.

---

## 2. Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               GOOGLE SPREADSHEET / SHEET HUB                            │
│  External Public Google Sheet / Connected Workspace / Native Sheet                      │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     SOURCE RECOGNITION & IMPORT HISTORY STORE                           │
│  users/{userId}/settings/study_import_sources ──► Tracks active syllabus sources        │
│  users/{userId}/settings/study_import_history ──► Chronological audit logs (≤ 100 runs)  │
│  Guarantees: Zero OAuth tokens, credentials, or private keys stored                     │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     CONFLICT & CHANGE DETECTION ENGINE (Step E)                         │
│  generateImportPreview(input) ──► TopicConflictAnalysis                                 │
│  ├── 🟢 New Topics (Not present in Study OS)                                            │
│  ├── 🔵 Unchanged Topics (Exact match on all fields)                                    │
│  ├── 🟡 Changed Content (Source text changed; highlighted diff fields)                  │
│  ├── 🟣 Missing in Sheet (Preserved in Study OS; practice & revisions protected)        │
│  └── 🔴 Duplicate Rows (Identical composite keys in source sheet)                       │
│                                                                                         │
│  User Choice: [✓] Update changed module & topic names from spreadsheet                  │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                      RE-IMPORT EXECUTION ENGINE (Step 4 & 5)                            │
│  executeSheetToStudyImport / retrySheetToStudyImport                                    │
│  - Bounded batch commits (≤ 200 writes / chunk)                                         │
│  - Progress protection (Done = TRUE completes Theory only; Practice stays untouched)   │
│  - Auto-updates study_import_sources & study_import_history                             │
└────────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                          STUDY OS WORKSPACE (Cloud Firestore)                           │
│  users/{userId}/study_subjects/{id} ──► users/{userId}/study_topics/{id}                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Models & Schemas

### A. Study Import Source (`StudyImportSource`)
Tracks an external Google Spreadsheet as an ongoing syllabus source:

```typescript
export interface StudyImportSource {
  id: string; // e.g. src_sheet_123 or spreadsheetId
  userId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl?: string | null;
  targetTierId: string;
  targetTierName?: string;
  importedSubjectCodes: string[];
  lastImportedAt: string;
  firstImportedAt: string;
  status: 'active' | 'untracked';
  totalImportsCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### B. Study Import History Record (`StudyImportHistoryRecord`)
Chronological audit record of an import execution run:

```typescript
export interface StudyImportHistoryRecord {
  id: string;
  userId: string;
  sourceSpreadsheetId: string;
  sourceSpreadsheetTitle: string;
  targetTierId: string;
  targetTierName?: string;
  selectedTabs: string[];
  createdSubjectsCount: number;
  updatedSubjectsCount: number;
  createdTopicsCount: number;
  updatedTopicsCount: number;
  skippedTopicsCount: number;
  duplicateRowsCount: number;
  invalidRowsCount: number;
  theoryCompletedCount: number;
  status: 'success' | 'partial' | 'failed';
  importedAt: string;
  errorMessage?: string | null;
  details?: StudyImportDetailItem[];
  failedRecords?: StudyImportFailedRecord[];
}
```

> [!IMPORTANT]
> **Zero Credential Guarantee:** Neither access tokens, refresh tokens, client secrets, nor session IDs are ever stored in `study_import_sources` or `study_import_history`. Both stores reside securely under `users/{userId}/settings/*` protected by `isOwner(userId)` in `firestore.rules`.

---

## 4. Re-import & Conflict Resolution Logic

When an existing spreadsheet is re-imported:
1. **Source Recognition:** The modal recognizes the spreadsheet ID, alerts the user, and pre-selects the previously chosen Academic Tier.
2. **Conflict Analysis:** `generateImportPreview` compares incoming rows with existing Study OS subjects and topics:
   - **New Topics:** Rows whose composite key (`sourceRowKey`), name key (`nameKey`), and concept key (`conceptKey`) do not match any existing topic.
   - **Unchanged Topics:** Rows matching an existing topic where `unit`, `topic`, `subtopic`, `priority`, and `notes` are identical.
   - **Changed Content:** Rows matching an existing topic where the spreadsheet author edited the title, unit, or priority. The exact diff fields (`diffFields: ['unit', 'priority']`) are displayed to the user.
   - **Missing Source Rows:** Topics that exist in Study OS under the imported subject codes but are absent from the spreadsheet. **Guaranteed Preserved:** These topics are never deleted.
   - **Duplicate Source Rows:** Identical rows within the source sheet flagged to prevent duplicate writes.
3. **User Control Policy:**
   - User can check or uncheck: `[✓] Update changed module & topic names from spreadsheet` (default: `true`).
   - If unchecked, Study OS topic names and units are frozen, while new topics are still imported and Theory is marked complete if `Done = TRUE`.
   - In all cases, **personal progress is strictly locked**: `practice`, `revisionCount`, `pyq`, and existing user notes are **NEVER overwritten**.

---

## 5. Progress Invariants & Field Protection Matrix

| Field | Source Managed? | Behavior on Re-Import (Update = True) | Behavior on Re-Import (Update = False) | Invariant Protection |
|---|---|---|---|---|
| `topic` | Yes | Updated if changed in sheet | Untouched (Preserved) | Safe |
| `subtopic` | Yes | Updated if changed in sheet | Untouched (Preserved) | Safe |
| `unit` | Yes | Updated if changed in sheet | Untouched (Preserved) | Safe |
| `priority` | Yes | Updated if changed in sheet | Untouched (Preserved) | Safe |
| `notes` | Shared | Updated only if existing topic has no notes | Untouched (Preserved) | User notes never overwritten |
| `theory` | Inferred | Set to `true` if `Done = TRUE` and topic is pending | Set to `true` if `Done = TRUE` and topic is pending | **Never regressed to false** |
| `practice` | **User-Owned** | **Untouched** | **Untouched** | **Practice is NEVER overwritten** |
| `pyq` | **User-Owned** | **Untouched** | **Untouched** | **PYQ is NEVER overwritten** |
| `revisionCount`| **User-Owned** | **Untouched** | **Untouched** | **Ebbinghaus intervals preserved** |
| `deletedAt` | **User-Owned** | **Untouched** | **Untouched** | **Missing sheet rows NEVER delete topics** |

---

## 6. Source Management & History UI

The system surfaces two primary management interfaces:

### 1. `StudyImportHistoryModal` (`src/components/sheets-hub/StudyImportHistoryModal.tsx`)
Accessible via the **Import History** toolbar button in `SheetHubView`:
- **Import History Tab:**
  - Searchable, chronological list of all import runs.
  - Status badges (`Success`, `Partial`, `Failed`).
  - Metric counters (`+N new`, `N updated`, `N done`).
  - Tab-by-tab breakdown accordion.
  - Clear history action (clears run logs without touching Study OS content).
- **Imported Sources Tab:**
  - Searchable list of connected spreadsheets tracked as syllabus sources.
  - Actions per source:
    - **Re-import:** Launches `ImportToStudyModal` pre-populated with that spreadsheet.
    - **Stop Tracking / Resume:** Toggles tracking status (`active` / `untracked`).
    - **Remove Metadata:** Deletes tracking entry from settings with prominent confirmation dialog and safety guarantee.

### 2. Conflict & Change Preview in `ImportToStudyModal` (`src/components/sheets-hub/ImportToStudyModal.tsx`)
- Sub-tab switcher: **Syllabus Topics** vs **Conflict & Change Analysis**.
- Metrics summary grid (New, Unchanged, Changed, Missing, Duplicates).
- Before/after diff preview cards for changed topic names and units.
- Reassurance banner for missing source rows.
- Policy checkbox to update or freeze source-managed content.
- Safe retry button for partial or failed runs.

---

## 7. Automated Test Suite Verification

A dedicated unit and regression test suite (`test/sheet_to_study_reimport.test.ts`) covers all 11 required scenarios:

```bash
# Run Step 5 Re-import, Conflict & History Tests
node --import tsx --import ./test/test_bootstrap.ts --test test/sheet_to_study_reimport.test.ts
```

### Test Verification Matrix

| Test Scenario | Verification Condition | Status |
|---|---|---|
| **1. Repeated Re-import** | Re-importing identical source produces 0 duplicate topics and records history | **PASS** |
| **2. Source Tab Renamed** | Renaming worksheet tab in Google Sheets matches topics via concept key without duplicates | **PASS** |
| **3. New Topic Appended** | Appending a row to spreadsheet creates only the 1 new topic; existing topics skipped | **PASS** |
| **4. Existing Topic Edited** | Editing topic name in sheet updates text; practice, revision count & PYQ remain strictly intact | **PASS** |
| **5. Rows Reordered** | Reordering rows in sheet produces 0 duplicate topics | **PASS** |
| **6. Source Row Deleted** | Deleting a row in spreadsheet does NOT delete or prune Study OS topic | **PASS** |
| **7. Conflict Preview Calculation** | `generateImportPreview` accurately identifies new, changed, unchanged, missing, and duplicate rows | **PASS** |
| **8. History & Source Tracking** | Complete history record and source metadata saved with zero leaked credentials | **PASS** |
| **9. Retry After Partial Failure** | `retrySheetToStudyImport` skips already created topics and commits only missing records | **PASS** |
| **10. Stop Tracking a Source** | Toggles source status to `untracked` while preserving all Study OS subjects and topics | **PASS** |
| **11. Remove Source Metadata** | Deleting source metadata removes tracking record but leaves all Study OS content intact | **PASS** |

### Complete Regression Suite Results
- **Step 3 Preview Tests:** 21 / 21 Passed
- **Step 4 Engine Tests:** 15 / 15 Passed
- **Step 5 Re-import Tests:** 11 / 11 Passed
- **Total Sheet-to-Study Tests:** 47 / 47 Passed (0 failures)
- **Full Application Test Suite (`npm test`):** **788 Passed**, 0 failed, 37 skipped
- **TypeScript Typecheck (`npm run typecheck`):** **0 errors**
- **Production Build (`npm run build:prod`):** Built cleanly in 416ms
