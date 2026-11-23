# Sheet Hub → Study OS Data Import Engine: Technical Specification & Implementation Guide

**Document:** `SHEET_TO_STUDY_IMPORT_ENGINE.md`  
**Phase:** Step 4 — Implement the Sheet to Study OS Import Engine  
**Target Version:** FocusFlow & Finance v1.8.0  
**Status:** Implemented, Fully Tested & Verified (15/15 Engine Tests, 21/21 Preview Tests, 777/777 Full Suite Tests)  
**Related Documents:** `SHEET_TO_STUDY_AUDIT.md`, `SHEET_TO_STUDY_MAPPING_DESIGN.md`, `SHEET_TO_STUDY_DATA_MODEL.md`, `SHEET_TO_STUDY_PREVIEW_UI.md`, `SHEET_TO_STUDY_REIMPORT_RULES.md`

---

## 1. Executive Summary

The **Sheet Hub → Study OS Data Import Engine** provides a secure, idempotent, and non-destructive pipeline for importing academic syllabi, modules, and topic checklists from connected Google Spreadsheets (including public link-accessible sheets and native local sheets) into the **Study OS** database.

The engine translates worksheet tabs into **Study Subjects** within a selected **Academic Tier**, and parses sheet rows into **Study Topics** with intelligent column mapping and progress preservation.

### Core Guarantees & Invariants
1. **Zero-AI & Zero External LLM:** Pure deterministic, rule-based inference, cryptographic hashing, and schema validation.
2. **Public Sheet Reader Integration:** Supports link-accessible Google Spreadsheets with automatic fallback to public CSV/JSON pulls (`api.sheetHubPull` with `publicAccess: true`), respecting private permission boundaries.
3. **Deterministic Idempotency:** Repeated imports of identical or modified sheets produce zero duplicate subjects or duplicate topics.
4. **Absolute Progress Protection:**
   - **Practice Invariant:** Spreadsheet `Done = TRUE` marks **Theory: Completed**; **Practice is NEVER overwritten or set to true**.
   - **Non-Regression:** An unchecked `Done` cell in Google Sheets will **NEVER reset an already completed Theory topic** back to pending.
   - **Retention Preservation:** Existing user revisions (`revisionCount`), next review dates (`nextReviewDate`), interval days (`intervalDays`), past-year question status (`pyq: true`), flashcards, mistake logs, and user notes are strictly preserved.
   - **Non-Destructive Pruning:** Deleted or missing rows in the source Google Sheet are **never deleted from Study OS**.
5. **Bounded Firestore Commits:** Writes are partitioned into chunks of $\le 200$ operations per batch, well below Cloud Firestore's 500-operation transaction ceiling.
6. **Strict Security Isolation:** All operations are constrained to `users/${userId}/study_subjects/*` and `users/${userId}/study_topics/*`, strictly honoring the update whitelist in `firestore.rules`.

---

## 2. System Architecture & Component Interactions

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               GOOGLE SPREADSHEET / SHEET HUB                           │
│  Public Link / OAuth / Native  ──►  Tabs [SheetTabSchema]  ──►  Rows [SheetSyncedRow]   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        IMPORT WIZARD UI (ImportToStudyModal.tsx)                       │
│  Step A: Tier Selection  ──►  Step B: Tab Filtering  ──►  Step C: Subject Mapping      │
│  Step D: Column Detection  ──►  Step E: Safety Audit & Live Preview Table              │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ "Execute Import to Study OS"
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    DATA IMPORT ENGINE (sheetToStudyImportEngine.ts)                    │
│                                                                                        │
│  1. Academic Tier Validation (api.getStudyTiers / ownership verification)              │
│  2. Public Sheet Fallback Reader (api.sheetHubPull publicAccess pipeline)              │
│  3. Input Sanitization Engine (sanitizeText: strips control chars, length capping)     │
│  4. In-Memory Reconciliation Matrix:                                                  │
│     - 3-Tier Topic Matching: sourceRowKey ──► exact nameKey ──► conceptKey            │
│     - Duplicate Row Detection within single worksheet                                  │
│     - Progress Preservation Engine (Theory adopted only if true; Practice untouched)   │
│  5. Bounded Batch Committer:                                                           │
│     - Chunk size: ≤ 200 writes / commit                                                │
│     - Direct Firestore writeBatch (signed-in) or api.saveStudy* fallback (guest/test) │
│  6. Subject Topic & Completion Counter Recalculator                                    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CLOUD FIRESTORE / LOCAL STORAGE                          │
│  users/{userId}/study_subjects/{id}  ──►  users/{userId}/study_topics/{id}            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Public Sheet Reader & Fallback Mechanism

The engine ensures seamless data loading regardless of the spreadsheet's authorization tier:

1. **Cached Memory / Local Store Check:** Checks `cachedRowsByTabId` passed from the preview modal or stored in IndexedDB/session cache (`sheetHubStore.loadTabRows`).
2. **Public Endpoint Fetch:** If rows are unpopulated in memory and the connection is an external Google Sheet (`!connection.isNative`), the engine triggers `api.sheetHubPull`:
   ```typescript
   const pullRes = await api.sheetHubPull(
     {
       spreadsheetId,
       tabs: [{ sheetId: tab.sheetId, sheetTitle: tab.sheetTitle }],
       publicAccess: true,
     },
     null
   );
   ```
3. **Cell Mapping:** Maps raw column values from the public API into strongly typed `SheetSyncedRow` entities, assigning row indices and row UIDs.
4. **Defensive Error Handling:** If the sheet is private, deleted, or network unavailable, the engine throws a structured error alerting the user before any mutations occur.

---

## 4. Input Sanitization & Untrusted Text Normalization

Untrusted text entered into Google Sheets is sanitized before database storage via `sanitizeText()`:

- **Control Character Stripping:** Non-printable ASCII control characters (`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`) are stripped to prevent database corruption and layout injection attacks.
- **Whitespace Normalization:** Leading and trailing whitespace is trimmed. Valid structural whitespaces (`\n` and `\t`) within notes or descriptions are preserved.
- **Maximum Length Boundaries:**
  - `subjectCode`: 64 characters
  - `subjectName`: 256 characters
  - `unit` / `module`: 128 characters
  - `topic`: 256 characters
  - `subtopic`: 256 characters
  - `notes`: 2,000 characters
- **Safe Nullability Handling:** `null`, `undefined`, numbers, and boolean inputs are safely cast without throwing runtime errors.

---

## 5. Topic Reconciliation & Identity State Machine

To prevent duplicate topic creation across successive imports and renames, the engine employs a **3-tier reconciliation hierarchy**:

```
           Incoming Source Row
                   │
                   ▼
       [1. sourceRowKey Match?]  ──── YES ───►  Match Existing Topic (Row Identity)
                   │ NO
                   ▼
         [2. nameKey Match?]     ──── YES ───►  Match Existing Topic (Exact Unit+Topic+Subtopic)
                   │ NO
                   ▼
       [3. conceptKey Match?]    ──── YES ───►  Match Existing Topic (Topic+Subtopic Concept Match)
                   │ NO
                   ▼
           Create New Topic
```

### Deterministic Keys
1. **Source Row Key (`sourceRowKey`):**
   A stable 32-hex FNV-1a composite hash derived from:
   $$\text{Hash}(\text{spreadsheetId} + \text{sheetId} + \text{cleanSubjectCode} + \text{unit} + \text{topic} + \text{subtopic})$$
2. **Exact Name Key (`nameKey`):**
   `${unit.toLowerCase()}|${topic.toLowerCase()}|${subtopic.toLowerCase()}`
3. **Concept Key (`conceptKey`):**
   `${topic.toLowerCase()}::${subtopic.toLowerCase()}`  
   *Ensures that if a unit or module is reorganized/renamed in the spreadsheet, the topic's progress is updated rather than creating a duplicate.*

---

## 6. Strict Progress & Invariant Protection Rules

The engine enforces five immutable progress rules:

| Domain Field | Spreadsheet Source | New Topic Create | Re-Import Existing Match | Protection Invariant |
|---|---|---|---|---|
| `theory` | `Done` Column (`TRUE`, `1`, `✓`, `☑`) | `true` (if Done) / `false` | Sets to `true` ONLY if Done is `TRUE` and topic was `false` | **NEVER regressed to false** if sheet row is unchecked. |
| `practice` | Any Column | `false` | **Untouched** | **NEVER overwritten**. Practice is completed exclusively inside Study OS. |
| `pyq` | Any Column | `false` | **Untouched** | **NEVER overwritten**. PYQ solving is tracked exclusively in Study OS. |
| `revisionCount` | Any Column | `0` | **Untouched** | **NEVER reset**. Ebbinghaus intervals remain intact. |
| `notes` | `Notes` Column | Source text | Updated ONLY if existing topic notes are blank | User's personal notes written in Study OS are **never overwritten**. |
| `deletedAt` | Missing in Sheet | N/A | **Untouched** | **Orphaned topics are NEVER deleted**. |

---

## 7. Bounded Batch Writes & Firestore Rules Compliance

### Batch Chunking ($\le 200$ Ops)
Cloud Firestore limits batch writes to 500 documents per request. To maintain headroom and prevent network payload timeouts, the engine enforces a strict chunk size:
```typescript
const CHUNK_SIZE = 200;
for (let i = 0; i < topicsToCreate.length; i += CHUNK_SIZE) {
  const chunk = topicsToCreate.slice(i, i + CHUNK_SIZE);
  // Commit batch chunk...
}
```

### Security Rules Whitelist (`firestore.rules`)
In `firestore.rules`, updates to `study_topics` enforce:
```javascript
request.resource.data.diff(resource.data).affectedKeys()
  .hasOnly(['priority', 'theory', 'practice', 'pyq', 'revisionCount', 'notes', 'updatedAt', 'deletedAt', 'rowIndex', 'topic', 'subtopic', 'unit'])
```
The import engine restricts update payloads strictly to these whitelisted fields. Transient import flags and metadata (e.g. `sourceContentHash`, `lastImportedAt`) are saved during initial creation or kept in memory to guarantee rule compliance.

---

## 8. Verification Matrix & Automated Test Suite Results

The import engine was thoroughly validated via automated unit and integration tests.

### Test Execution Commands
```bash
# Run Import Engine Unit Tests (15 tests)
node --import tsx --import ./test/test_bootstrap.ts --test test/sheet_to_study_import_engine.test.ts

# Run Preview Engine Unit Tests (21 tests)
node --import tsx --import ./test/test_bootstrap.ts --test test/sheet_to_study_preview.test.ts

# Full Workspace Regression Suite (777 tests)
npm test
```

### Verification Results Summary

| Test Case | Verification Condition | Result |
|---|---|---|
| **Test 1: First Import** | Creates subjects & topics; sets `theory: true` on Done rows while keeping `practice: false`. | **PASS** |
| **Test 2: Repeated Import** | Re-importing exact same sheet creates 0 duplicate subjects and 0 duplicate topics. | **PASS** |
| **Test 3: New Rows on Re-import** | Appending new rows to an imported sheet creates only the new topics. | **PASS** |
| **Test 4: Changed Rows** | Modifying topic/unit text updates approved source fields without modifying progress. | **PASS** |
| **Test 5: Duplicate Titles in Different Tabs** | Same topic names in different tabs create separate topics under respective subjects. | **PASS** |
| **Test 6: Blank Rows Handling** | Empty topic & subtopic rows are skipped safely and counted as invalid rows. | **PASS** |
| **Test 7: Checkbox / Boolean Formats** | Correctly parses `TRUE`, `true`, `1`, `'1'`, `'yes'`, `'checked'`, `☑`, `✓`. | **PASS** |
| **Test 8: Practice Progress Preservation** | Existing `practice: true` topic remains `true` when re-imported. | **PASS** |
| **Test 9: Revision & PYQ Preservation** | Existing `revisionCount: 3` and `pyq: true` remain untouched during re-import. | **PASS** |
| **Test 10: Academic Tier Validation** | Non-existent or unauthorized tier IDs throw structured validation error. | **PASS** |
| **Test 11: Missing Source Rows Preservation** | Deleted source rows do NOT delete or prune existing Study OS topics. | **PASS** |
| **Test 12-15: Input Sanitization** | Control character stripping, length capping, and whitespace normalization verified. | **PASS** |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) passes with 0 errors. | **PASS** |
| **Production Build** | `npm run build:prod` builds cleanly in 373ms with 0 bundle errors. | **PASS** |

---

## 9. User Experience in Import Wizard

The import flow within `src/components/sheets-hub/ImportToStudyModal.tsx` provides immediate user feedback:
1. **Live Progress Feedback:** Real-time progress bar (`ThemeProgressBar`) displaying current stage (Tier validation $\to$ Spreadsheet reading $\to$ Reconciliation $\to$ Chunked batch writes $\to$ Completion).
2. **Detailed Execution Results Screen:**
   - Total Subjects Created & Updated
   - Total Topics Created, Updated, and Skipped
   - Duplicate Rows & Invalid Rows Filtered
   - Theory Topics Marked Completed
   - Tab-by-tab breakdown badge table
3. **Direct Navigation:** "Done & Close" button smoothly dismisses the modal and returns the user to the active Sheet Hub workspace with updated synchronization state.

