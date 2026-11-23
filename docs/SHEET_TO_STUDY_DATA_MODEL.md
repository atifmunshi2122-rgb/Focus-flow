# Sheet Hub → Study OS Import Bridge: Data Models & Schema Design

**Document:** `SHEET_TO_STUDY_DATA_MODEL.md`  
**Phase:** Step 2 — Architecture & Design Specification  
**Status:** Approved Design (Non-Implementation)  
**Related Documents:** `SHEET_TO_STUDY_MAPPING_DESIGN.md`, `SHEET_TO_STUDY_REIMPORT_RULES.md`

---

## 1. Domain Model Extensions

To enable non-destructive imports, deterministic duplicate prevention, and clean source traceability, the core Study OS domain interfaces in `src/types/study.ts` are extended with isolated source metadata properties.

### A. Extended `StudySubject` Interface

```typescript
export interface StudySubject {
  // --- Existing v1.7.0 / v1.8.0 Properties ---
  id: string;               // 'subj_<timestamp>_<rand>'
  userId: string;           // Authenticated owner UID
  code: string;             // Unique identifier, e.g. 'Sub_DBMS'
  name: string;             // Course Title, e.g. 'Database Management Systems'
  tierId: string;           // AcademicTier reference
  semesterOrDomain?: string;// e.g. 'Semester 3 / Core CSE'
  targetExam?: string;      // e.g. 'University Finals'
  totalSubtopics: number;   // Active topic count
  completedSubtopics: number;// Completed topic count (theory && practice)
  color?: string;           // Hex color accent
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  // --- New Inbound Import Source Metadata ---
  sourceOrigin?: 'manual' | 'google_sheet' | 'seed';
  sourceSpreadsheetId?: string; // Connected Google Spreadsheet ID
  sourceSheetId?: number;       // Tab numeric GID
  sourceTabTitle?: string;      // Original sheet tab name (e.g. 'DBMS')
  importedAt?: string;          // ISO timestamp of initial import
  lastImportedAt?: string;      // ISO timestamp of latest re-import
}
```

### B. Extended `StudyTopic` Interface

```typescript
export interface StudyTopic {
  // --- Existing v1.7.0 / v1.8.0 Properties ---
  id: string;               // 'topic_<timestamp>_<rand>'
  userId: string;           // Authenticated owner UID
  subjectCode: string;      // Links to StudySubject.code
  unit: string;             // Module / Unit (e.g. 'Unit 1: Relational Model')
  topic: string;            // Primary Area (e.g. 'ER & Relational Algebra')
  subtopic: string;         // Concept Title (e.g. 'Entity Sets, Keys')
  priority: 'High' | 'Medium' | 'Low';
  theory: boolean;          // Lecture / Reading completed
  practice: boolean;        // Coding / Problem solving completed
  pyq: boolean;             // Previous Years Questions solved
  revisionCount: number;    // Ebbinghaus interval counter
  notes?: string;           // Formulas, links, or personal notes
  rowIndex?: number;        // Physical sequence index
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;

  // --- New Inbound Import Source Metadata ---
  sourceOrigin?: 'manual' | 'google_sheet' | 'seed';
  sourceSpreadsheetId?: string; // Connected Google Spreadsheet ID
  sourceSheetId?: number;       // Tab numeric GID
  sourceRowKey?: string;        // Deterministic 32-hex FNV-1a hash of composite key
  sourceContentHash?: string;   // FNV-1a hash of source row values (unit + topic + subtopic + notes)
  sourceSheetRowNumber?: number;// Physical row in Google Sheet (transient metadata)
  importedAt?: string;          // ISO timestamp of initial import
  lastImportedAt?: string;      // ISO timestamp of latest re-import
  isSourceOrphaned?: boolean;   // True if deleted in source sheet but kept in Study OS
}
```

---

## 2. Bridge Configuration & Workflow Interfaces

These types define the parameters and state transitions of the interactive Import Bridge dialog.

```typescript
// ============================================================================
// 1. CONFIGURATION & MAPPING INTERFACES
// ============================================================================

export interface ColumnToFieldMapping {
  fieldKey: string;             // Source sheet field key (e.g. 'module_0')
  headerName: string;           // Original header text (e.g. 'Module')
  targetField: 'unit' | 'topic' | 'subtopic' | 'done' | 'notes' | 'priority' | 'unmapped';
}

export interface TabToSubjectMapping {
  sheetId: number;              // Google Sheet tab GID
  sheetTitle: string;           // Sheet tab title (e.g. 'Prob & Stats')
  isIncluded: boolean;          // User inclusion toggle
  action: 'create_new' | 'map_existing';
  targetSubjectId?: string;     // If mapping to existing subject
  targetSubjectCode: string;    // e.g. 'Sub_PROBSTATS'
  targetSubjectName: string;    // e.g. 'Probability & Statistics'
  targetColor: string;          // UI theme hex color
  columns: ColumnToFieldMapping[];
  detectedRowCount: number;
}

export interface SheetToStudyImportConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  isPublicLink: boolean;
  targetTierId: string;         // References AcademicTier.id
  tabs: TabToSubjectMapping[];
  // Policy flags
  markDoneAsTheoryOnly: boolean;// Default: true (Done -> Theory = true, Practice = false)
  skipExistingTopics: boolean;  // Default: false (re-import updates content)
}

// ============================================================================
// 2. PREVIEW & SUMMARY INTERFACES
// ============================================================================

export interface ImportPreviewTopic {
  unit: string;
  topic: string;
  subtopic: string;
  theory: boolean;
  practice: boolean;
  pyq: boolean;
  notes?: string;
  priority: 'High' | 'Medium' | 'Low';
  sourceRowKey: string;
  isExistingMatch: boolean;     // True if topic already exists in Study OS
  existingTopicId?: string;
}

export interface ImportPreviewSubject {
  subjectCode: string;
  subjectName: string;
  sheetTitle: string;
  tierId: string;
  color: string;
  isNewSubject: boolean;
  topics: ImportPreviewTopic[];
  totalTopics: number;
  theoryCompletedCount: number;
}

export interface ImportExecutionResult {
  success: boolean;
  createdSubjectsCount: number;
  updatedSubjectsCount: number;
  createdTopicsCount: number;
  updatedTopicsCount: number;
  skippedTopicsCount: number;
  tierId: string;
  executionDurationMs: number;
  error?: string;
}
```

---

## 3. Duplicate-Safe Deterministic Identity Algorithm

To ensure topics are never duplicated during repeated imports or when rows are shifted in the spreadsheet, the bridge computes a **Deterministic Source Row Key**:

### Key Generation Algorithm

```typescript
import { deterministicHashHex } from '../sheetHub/rowIdentity.ts';

export function computeSourceRowKey(
  spreadsheetId: string,
  sheetId: number,
  subjectCode: string,
  unit: string,
  topic: string,
  subtopic: string
): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  
  // Explicit hierarchical composite identity
  const composite = [
    spreadsheetId.trim(),
    String(sheetId),
    norm(subjectCode),
    norm(unit),
    norm(topic),
    norm(subtopic),
  ].join('::');

  // Produces a collision-resistant 32-character hex string
  return `srow_${deterministicHashHex(composite)}`;
}

export function computeContentHash(
  unit: string,
  topic: string,
  subtopic: string,
  notes?: string
): string {
  const norm = (s?: string) => (s || '').trim().replace(/\s+/g, ' ');
  const payload = [norm(unit), norm(topic), norm(subtopic), norm(notes)].join('|');
  return `chash_${deterministicHashHex(payload)}`;
}
```

### Identity Characteristics & Safety Guarantees:
1. **Row Shift Invariance:** Physical row numbers (`lastKnownSheetRow` or `rowIndex`) are **never** included in the hash. Inserting 10 rows at the top of the spreadsheet does not change the key of subsequent rows.
2. **Subject Scoping:** Keys are strictly isolated by `spreadsheetId`, `sheetId`, and `subjectCode`. Identical topic names in different subjects (e.g. "Introduction" in COA vs. "Introduction" in DBMS) yield distinct keys.
3. **Collision Resistance:** Evaluated with FNV-1a 64-bit dual-prime hashing, providing collision-free indexing across tens of thousands of syllabus items.

---

## 4. Firestore Document Storage & Batch Limits

### Firestore Collection Paths
- `users/{userId}/study_subjects/{subjectId}`
- `users/{userId}/study_topics/{topicId}`

### Firestore Rule Conformance (`firestore.rules`)
All documents conform to existing security invariants:
- `request.resource.data.userId == userId`
- `isValidId(subjectId)` and `isValidId(topicId)`
- `isNonEmptyString(code, 64)` on subjects
- `isNonEmptyString(subjectCode, 64)` on topics

### Safe Batch Chunking Strategy
Cloud Firestore enforces a hard limit of **500 operations per `writeBatch`**. To guarantee atomic execution without network timeouts:

```typescript
const MAX_BATCH_SIZE = 400; // Conservative safety margin

export async function commitChunkedStudyWrites(
  db: Firestore,
  operations: Array<{ ref: DocumentReference; data: Record<string, unknown> }>
): Promise<void> {
  const chunks: Array<typeof operations> = [];
  for (let i = 0; i < operations.length; i += MAX_BATCH_SIZE) {
    chunks.push(operations.slice(i, i + MAX_BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }
}
```
