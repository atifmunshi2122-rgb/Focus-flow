# Codebase Audit: Sheet Hub → Study OS Import Bridge

**Project:** FocusFlow & Finance  
**Current Audited Baseline:** v1.8.0 / v1.7.0 Core Architecture  
**Target Capability:** "Import to Study OS" — Transforming Google Sheets tabs into Study Subjects and sheet rows into Study Topics.  
**Audit Date:** 2026-11-23  
**Auditor:** Senior Full-Stack Architect & Firebase Engineer  
**Status:** Complete Architectural Audit (Read-Only / No Code Changes)

---

## 1. Executive Summary

FocusFlow & Finance currently features two sophisticated, independently developed subsystems:
1. **Universal Sheet Sync Hub (`Sheet Hub`):** A dynamic, schema-agnostic Google Sheets synchronization engine supporting zero-OAuth public link inspection (via OpenXML XLSX export), per-user Google Sheets API v4 OAuth inspection/pulling/pushing, automated semantic column role detection (`schemaDetector.ts`), composite-key row identity tracking (`rowIdentity.ts`), and chunked Firestore persistence (`sheetHubStore.ts`).
2. **NextStudy OS (`Study OS`):** A hierarchical academic intelligence system comprising Academic Tiers, Study Subjects, Study Topics (with multi-faceted progress tracking: Theory, Practice, PYQs, and Notes), Ebbinghaus spaced interval revisions, and mistake journals.

### Key Audit Finding
While an outbound checkbox write-back bridge already exists (`sheetStudySyncService.ts` syncs completion marks from Study OS back to connected Google Sheets), **no inbound "Import to Study OS" bridge exists anywhere in the codebase**. There is currently no UI action, service, or batch conversion pipeline to take a connected or public spreadsheet and ingest its tabs as `StudySubject` records and rows as `StudyTopic` records.

However, all necessary prerequisite primitives (public OpenXML fetching, schema detection, semantic role classification, and Firestore subject/topic repositories) are already mature and fully functional. Implementing this feature requires no new third-party dependencies.

---

## 2. Existing Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GOOGLE SHEETS INGESTION                         │
└────────────────────────────────────────────────────────────────────────┘
          │ (A) Public Sheet (Zero-OAuth)        │ (B) Private Sheet (OAuth)
          ▼                                      ▼
  OpenXML XLSX Export Stream               Google Sheets API v4
  (/export?format=xlsx)                   (spreadsheets.get & values.batchGet)
          │                                      │
          └──────────────────┬───────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     UNIVERSAL SHEETS WORKER                            │
│                 server/universalSheetsWorker.ts                        │
├────────────────────────────────────────────────────────────────────────┤
│ • detectHeaderRowIndex() : Locates table header row (1-based)          │
│ • detectWorkbookSchema() : Inferred column types & semantic roles     │
│ • inspectPublicSpreadsheet() / inspectSpreadsheet()                    │
│ • pullPublicSpreadsheetTabs() / pullSpreadsheetTabs()                  │
└────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼ Returns Tab Schemas & Row Arrays
┌────────────────────────────────────────────────────────────────────────┐
│                        SHEET HUB STORE LAYER                           │
│                   src/lib/sheetHub/sheetHubStore.ts                    │
├────────────────────────────────────────────────────────────────────────┤
│ • users/{uid}/sheet_connections/{connId}                               │
│ • users/{uid}/sheet_tabs/{connId}__tab_{sheetId}                       │
│ • users/{uid}/sheet_row_chunks/{tabId}__chunk_{index}                  │
└────────────────────────────────────────────────────────────────────────┘
                             │
                             │   [CURRENT GAP]
                             │   No Inbound Transformer Exists
                             │   Tabs != StudySubject | Rows != StudyTopic
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        STUDY OS DATA LAYER                             │
│       src/lib/firestoreService.ts & src/types/study.ts                 │
├────────────────────────────────────────────────────────────────────────┤
│ • users/{uid}/study_tiers/{tierId}                                     │
│ • users/{uid}/study_subjects/{subjId}                                  │
│ • users/{uid}/study_topics/{topicId}                                   │
└────────────────────────────────────────────────────────────────────────┘
                             │
                             ▼ Outbound Write-Back Only
┌────────────────────────────────────────────────────────────────────────┐
│                  CHECKBOX WRITE-BACK BRIDGE                            │
│             src/lib/sheetHub/sheetStudySyncService.ts                  │
├────────────────────────────────────────────────────────────────────────┤
│ • syncStudyTopicCompletionToGoogleSheets()                             │
│ • Matches topic.subjectCode -> sheetTitle via isSubjectMatchingTab()   │
│ • Finds Done column via findDoneColumn()                               │
│ • Pushes cell update (e.g. 'DBMS'!D14 = TRUE) via push-cells endpoint  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Relevant Source Files & Functions

### A. Sheet Ingestion & Schema Detection
| Source File | Relevant Functions / Classes | Responsibilities |
|-------------|------------------------------|------------------|
| `server/universalSheetsWorker.ts` | `inspectPublicSpreadsheet`<br>`pullPublicSpreadsheetTabs`<br>`fetchPublicSpreadsheetXlsx`<br>`inspectSpreadsheet`<br>`pullSpreadsheetTabs` | Fetches raw sheets via OpenXML XLSX stream (zero-auth) or Google API v4 (OAuth). Converts raw sheet buffers into cell matrices. |
| `src/lib/sheetHub/urlParser.ts` | `parseGoogleSheetUrl`<br>`isValidGoogleSpreadsheetId` | Extracts canonical `spreadsheetId` and `gid` from standard, edit, view, and query-bearing URLs. Validates hosts and rejects unsupported `/d/e/2PACX-` web published links. |
| `src/lib/sheetHub/schemaDetector.ts` | `detectHeaderRowIndex`<br>`inferSemanticRole`<br>`inferColumnMapping`<br>`detectWorkbookSchema` | Analyzes up to 10 sample rows; infers data types (`text`, `number`, `boolean`, `checkbox`, `formula`); assigns semantic roles (`group`, `subgroup`, `title`, `done`, `notes`, `priority`). Distinguishes data tabs from overview tabs. |
| `src/lib/sheetHub/rowIdentity.ts` | `generateRowIdentity`<br>`generateCompositeKey` | Creates stable composite identity strings (`module_topic_subtopic`) resilient to row insertions, deletions, and sorting. |
| `server/routes.ts` | `POST /api/sheet-hub/inspect`<br>`POST /api/sheet-hub/pull` | Express routes routing inspect/pull requests to public or OAuth workers based on `publicAccess: true`. |

### B. Sheet Hub State & UI
| Source File | Component / Hook / Method | Responsibilities |
|-------------|---------------------------|------------------|
| `src/components/sheets-hub/SheetHubView.tsx` | `SheetHubView`<br>`handlePullUpdates`<br>`handleToggleSyncMode` | Main Sheet Hub container. Manages active connection workspace, sync status banner, and tab switcher. Currently lacks an "Import to Study OS" action button. |
| `src/components/sheets-hub/SheetConnectionCard.tsx` | `SheetConnectionCard` | Card representing a connected spreadsheet on the hub dashboard with kebab action menu (Pause, Reconnect, Remove). |
| `src/components/sheets-hub/ConnectSheetWizard.tsx` | `ConnectSheetWizard`<br>`handleInspectPublicLink`<br>`handleAuthorizeGoogleWrite` | 7-step onboarding wizard (URL, Auth, Tabs, Columns, Identity, View, Confirm). Saves connection, tab schemas, and chunked rows. |
| `src/lib/sheetHub/sheetHubStore.ts` | `saveConnection`<br>`saveTabSchema`<br>`saveTabRowsChunked`<br>`loadTabRows`<br>`listTabsForConnection` | High-level data store interfacing client cache and Firestore subcollections (`sheet_connections`, `sheet_tabs`, `sheet_row_chunks`). |

### C. Study OS Core & Persistence
| Source File | Component / Method | Responsibilities |
|-------------|--------------------|------------------|
| `src/components/study/StudyView.tsx` | `StudyView`<br>`loadData`<br>`toggleTopicDone`<br>`handleTopicToggle` | Primary academic dashboard. Manages active tier, subject list, topic tables, progress summary metrics, and dispatches completion sync events. |
| `src/lib/firestoreService.ts` | `getStudySubjects`<br>`saveStudySubject`<br>`deleteStudySubject`<br>`getStudyTopics`<br>`saveStudyTopic`<br>`deleteStudyTopic` | Firestore repository methods for `users/{uid}/study_subjects` and `users/{uid}/study_topics`. Includes automatic fallback to default seeded syllabus for new users. |
| `src/lib/api.ts` | `api.getStudySubjects`<br>`api.saveStudySubject`<br>`api.getStudyTopics`<br>`api.saveStudyTopic` | Unified frontend API client. Dispatches requests to `firestoreService` for authenticated Firebase users or server REST fallback. |
| `src/components/study/AddStudySubjectModal.tsx` | `AddStudySubjectModal` | Dialog for manually adding an academic course (`name`, `code`, `tierId`, `color`, `semesterOrDomain`). |
| `src/components/study/AddStudyTopicModal.tsx` | `AddStudyTopicModal` | Dialog for manually adding a topic (`unit`, `topic`, `subtopic`, `priority`, `theory`, `practice`, `pyq`, `notes`). |
| `src/components/study/ExportRestoreStudyModal.tsx` | `ExportRestoreStudyModal`<br>`validateStudyExportPayload` | Manages whole-workspace JSON export and restore. Lacks any spreadsheet integration. |
| `src/lib/sheetHub/sheetStudySyncService.ts` | `syncStudyTopicCompletionToGoogleSheets`<br>`isSubjectMatchingTab`<br>`findDoneColumn`<br>`findMatchingRowForTopic` | Outbound single-topic checkbox sync engine. Matches topic to sheet rows and updates Google Sheets cells. |

---

## 4. Current Data Models

### A. Study OS Models (`src/types/study.ts`)

```typescript
export interface AcademicTier {
  id: string;               // e.g. 'tier1_sem3', 'tier2_placements', 'tier3_gate', 'custom'
  name: string;             // e.g. 'College Semester Core'
  shortTitle: string;       // e.g. 'Semester Core'
  description: string;
  subjectCodes?: string[];  // ['Sub_DBMS', 'Sub_OS', ...]
  userId?: string;
}

export interface StudySubject {
  id: string;               // 'subj_<timestamp>_<rand>'
  userId: string;
  code: string;             // Unique identifier, e.g. 'Sub_DBMS', 'Sub_COA'
  name: string;             // Course name, e.g. 'Database Management Systems'
  tierId: string;           // References AcademicTier.id
  semesterOrDomain?: string;// e.g. 'Semester 3 / Core CSE'
  targetExam?: string;      // e.g. 'University Final / GATE'
  totalSubtopics: number;   // Total active syllabus topics
  completedSubtopics: number;// Topics where completion condition is met
  color?: string;           // Hex color for UI accents
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface StudyTopic {
  id: string;               // 'topic_<timestamp>_<rand>'
  userId: string;
  subjectCode: string;      // Matches StudySubject.code
  unit: string;             // Module / Unit (e.g. 'Unit 1: Relational Model')
  topic: string;            // Primary Area (e.g. 'ER & Relational Algebra')
  subtopic: string;         // Concept Title (e.g. 'Entity Sets, Keys, Cartesian Product')
  priority: 'High' | 'Medium' | 'Low';
  theory: boolean;          // Lecture / Reading completed
  practice: boolean;        // Coding / Problem solving completed
  pyq: boolean;             // Previous Years Questions solved
  revisionCount: number;    // Ebbinghaus spaced interval counter
  notes?: string;           // Practice links, formulas, or reminders
  rowIndex?: number;        // Physical sequence index in syllabus
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
```

### B. Sheet Hub Models (`src/types/sheetHub.ts`)

```typescript
export interface SheetConnection {
  id: string;               // 'conn_<timestamp>_<rand>'
  userId: string;
  spreadsheetId: string;    // Google Spreadsheet ID
  spreadsheetUrl: string;
  title: string;
  syncMode: 'two_way' | 'sheet_to_app' | 'manual_only';
  isPublicLink?: boolean;   // True when connected without OAuth
  status: 'active' | 'paused' | 'auth_required' | 'error';
  tabOrder: string[];
}

export interface SheetTabSchema {
  id: string;               // '${connectionId}__tab_${sheetId}'
  connectionId: string;
  userId: string;
  sheetId: number;          // Google sheet tab numeric GID
  sheetTitle: string;       // Name of the tab (e.g. 'DBMS', 'COA', 'Overview')
  role: 'data' | 'overview' | 'ignored';
  columns: SheetColumnMapping[];
  rowCount: number;
}

export interface SheetColumnMapping {
  colIndex: number;         // 0-based
  colLetter: string;        // 'A', 'B', 'C', ...
  fieldKey: string;         // e.g. 'module_0', 'topic_1', 'subtopic_2', 'done_3'
  headerName: string;       // e.g. 'Module', 'Topic', 'Subtopic', 'Done'
  inferredType: SheetFieldType; // 'text', 'checkbox', 'boolean', 'formula', ...
  semanticRole: SheetSemanticRole; // 'group', 'subgroup', 'title', 'done', 'notes', 'priority'
  editable: boolean;
}

export interface SheetSyncedRow {
  rowUid: string;           // Stable identity
  lastKnownSheetRow: number;// Physical row in sheet (e.g. 2, 3, 4...)
  values: Record<string, SheetCellScalar>; // fieldKey -> cell value
  baseValues: Record<string, SheetCellScalar>;
  status: 'synced' | 'pending_push' | 'conflict';
}
```

---

## 5. Existing Import/Export Capabilities vs. What is Missing

### What Already Works
1. **Zero-OAuth Public Sheet Ingestion:**
   - The backend `inspectPublicSpreadsheet` and `pullPublicSpreadsheetTabs` download public Google Spreadsheets as OpenXML XLSX files without requiring user sign-in to Google or FocusFlow.
   - Tested and verified on `test/fixtures/Semester 3 - Syllabus & Topic Tracker.xlsx` (597 topics successfully extracted across 4 subject tabs).
2. **Deterministic Semantic Classification:**
   - `schemaDetector.ts` automatically recognizes headers such as `Module` as `group`, `Topic` as `subgroup`, `Subtopic` as `title`, `Done` as `done`, and `Notes` as `notes`.
3. **Outbound Write-Back:**
   - When a user ticks a checkbox in Study OS, `sheetStudySyncService.ts` locates the connected sheet, matches the tab name to subject code, finds the row, and writes the update back to Google Sheets.
4. **Study OS JSON Portability:**
   - `ExportRestoreStudyModal.tsx` exports and imports complete Study OS workspaces via JSON backup files.

### What is Completely Missing
1. **No Inbound Transform Pipeline:**
   - There is no function to map a `SheetTabSchema` into a `StudySubject`.
   - There is no function to map `SheetSyncedRow[]` into `StudyTopic[]`.
2. **No "Import to Study OS" UI Action:**
   - In `SheetHubView.tsx` and `SheetConnectionCard.tsx`, there is no button, menu item, or modal to initiate an import into Study OS.
   - In `StudyView.tsx`, there is no option in the toolbar to "Import from Google Sheets".
3. **No Target Academic Tier Selector:**
   - When creating subjects from sheet tabs, there is no UI to choose which `AcademicTier` (e.g. Semester Core, Placements, or a Custom Tier) the new subjects should be assigned to.
4. **No Topic Field Mapping Configurator:**
   - While `schemaDetector.ts` identifies `done`, `notes`, and `priority`, Study OS has separate boolean flags:
     - `theory`
     - `practice`
     - `pyq`
   - In existing sheets like Semester 3, there is only a single `Done` column. The system currently lacks a strategy to map a single `Done` column into `theory` and `practice`.
5. **No Deduplication / Merge Logic:**
   - If a subject named "DBMS" already exists in Study OS, importing a tab named "DBMS" currently has no defined behavior (overwrite, skip, append topics, or update existing topics).

---

## 6. Technical Blockers & Constraints

| # | Technical Constraint / Blocker | Architectural Impact & Resolution |
|---|--------------------------------|-----------------------------------|
| **1** | **Firestore 500-Operation Batch Limit** | A large syllabus (such as the Semester 3 fixture with 597 topics) exceeds Cloud Firestore's hard limit of 500 operations per `writeBatch`. An import will crash with `InvalidArgumentError` if not chunked into sub-batches ($\le 400$ writes per batch). |
| **2** | **Subject Code Uniqueness Invariant** | In Study OS, `StudyTopic.subjectCode` links topics to `StudySubject.code`. If a sheet tab is titled "Database Management Systems", generating a valid, clean, unique alphanumeric code (e.g. `Sub_DBMS`) is required before creating topic documents. |
| **3** | **Single Checkbox vs Tri-State Topic Progress** | In Google Sheets, a topic row typically has one checkbox (`Done`). In Study OS, topics have three distinct progress flags: `theory` (boolean), `practice` (boolean), and `pyq` (boolean). In Study OS metrics, a topic is only "completed" when `theory && practice` is true. The import transformer must default `theory = true` and `practice = true` when `Done` is checked in the sheet. |
| **4** | **Overview & Summary Tabs Must Be Filtered** | Multi-subject workbooks almost always contain an `Overview` or `Dashboard` sheet. The import engine must respect `tab.role === 'data'` and reject tabs where `tab.role === 'overview'` or formula-only summaries to prevent corrupting the course catalog. |
| **5** | **Public Sheets Are Strictly Read-Only** | If a user imports a syllabus via a public zero-OAuth link, inbound import of subjects and topics works smoothly, but outbound write-back back to Google Sheets cannot function (HTTP 403 / no write token). The UI must communicate that imported public sheets operate in read-only mode in Study OS. |

---

## 7. Recommended Implementation Approach

### Step 1: Create Domain Transformer Service (`src/lib/sheetHub/sheetToStudyTransformer.ts`)
Implement pure, deterministic conversion utilities:
```typescript
export interface SheetToStudyImportConfig {
  connectionId: string;
  tierId: string; // Target Academic Tier
  tabSelections: Array<{
    sheetTitle: string;
    sheetId: number;
    subjectName: string;
    subjectCode: string;
    color?: string;
  }>;
  columnRoleOverrides?: Record<number, Record<string, string>>; // tabId -> fieldKey -> targetField
  markAsTheoryAndPractice?: boolean; // When Done is true, set both theory & practice to true
}

export function transformSheetTabToSubject(
  userId: string,
  tab: SheetTabSchema,
  tierId: string,
  customCode?: string,
  customName?: string
): StudySubject;

export function transformSheetRowsToTopics(
  userId: string,
  subjectCode: string,
  tab: SheetTabSchema,
  rows: SheetSyncedRow[]
): StudyTopic[];
```

### Step 2: Implement Batch Ingestion in `firestoreService.ts`
Add a dedicated, atomic batch importer that chunks writes:
```typescript
async importSheetToStudyWorkspace(
  userId: string,
  subjects: StudySubject[],
  topics: StudyTopic[]
): Promise<{ importedSubjects: number; importedTopics: number }>;
```
- Splits writes into chunks of 400 documents per `writeBatch`.
- Updates `totalSubtopics` and `completedSubtopics` counts on each `StudySubject`.
- Commits atomically and invalidates `clientDataCache` caches.

### Step 3: Add UI Modal & Entry Points
1. **Sheet Hub Workspace Toolbar (`SheetHubView.tsx`):**
   - Add a primary action button in the workspace top header: `<ThemeButton onClick={() => setImportToStudyOpen(true)}>Import to Study OS</ThemeButton>`.
2. **Sheet Hub Connection Card (`SheetConnectionCard.tsx`):**
   - Add "Import to Study OS" in the kebab menu.
3. **Study OS Toolbar (`StudyView.tsx`):**
   - Add "Import from Google Sheets" alongside "Add Subject" and "Export/Restore".
4. **Dedicated Modal (`src/components/sheets-hub/ImportToStudyModal.tsx`):**
   - Step 1: Select/confirm target `AcademicTier` (e.g. Semester Core).
   - Step 2: Checkbox list of detected data tabs (with auto-generated Subject Codes and Colors).
   - Step 3: Column verification preview (verifying Module $\to$ Unit, Topic $\to$ Topic, Subtopic $\to$ Subtopic, Done $\to$ Theory/Practice).
   - Step 4: Import execution with live progress bar.

---

## 8. Security & Data Integrity Audit

1. **Multi-Tenant Authorization:**
   - Both `users/{uid}/study_subjects` and `users/{uid}/study_topics` are protected by `isOwner(userId)` in `firestore.rules`.
   - The import pipeline must execute using the authenticated user's session UID (`auth.currentUser.uid`).
   - Cross-user contamination is impossible.
2. **Zero-Token Leakage:**
   - Public sheet imports execute via server OpenXML proxy (`fetchPublicSpreadsheetXlsx`) with zero tokens transmitted or stored.
   - Private sheet imports utilize the ephemeral in-memory OAuth token (`getSheetHubAccessToken()`).
   - Neither tokens nor service account credentials are stored in Firestore subject or topic records.
3. **Idempotency & Non-Destructive Ingestion:**
   - Importing should check if `StudySubject.code` already exists:
     - If subject exists: Prompt user to choose between **"Update existing topics"** or **"Skip subject"**.
     - Never delete unrelated user study entities (revisions, mistake logs, goals, or study plans) during a sheet import.
4. **Input Sanitization:**
   - Tab names, units, topics, and subtopics must be trimmed and bounded to 256 characters to prevent oversized document writes.
   - Code generation must strip non-alphanumeric characters (regex: `/[^a-zA-Z0-9_]/g`).

---

## 9. Conclusion

FocusFlow & Finance contains all foundational capabilities required to implement **Import to Study OS**:
- Public and private sheets can already be parsed and converted into typed rows.
- Dynamic schema detection already correctly identifies semantic hierarchy (`Module` $\to$ Unit, `Topic` $\to$ Topic, `Subtopic` $\to$ Subtopic, `Done` $\to$ Completion).
- Study OS already has robust subcollection repositories for subjects and topics.

The missing link is purely an **inbound adapter layer** that converts detected tabs and rows into Study OS entities and writes them in safe Firestore batches. Implementing this bridge will complete the bidirectional integration between Google Sheets and Study OS.
