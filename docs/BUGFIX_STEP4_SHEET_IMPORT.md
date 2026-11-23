# BUGFIX STEP 4: Sheet Hub to Study OS Import Integrity & Recovery Architecture

## Overview
In FocusFlow & Finance v1.8.0, the Sheet Hub to Study OS import bridge converts academic syllabi from Google Sheets into structured Study OS subjects, units, topics, and subtopics. An in-depth audit identified critical data integrity vulnerabilities in earlier revisions:
1. **Masked Critical Reads**: Read failures (network timeout, 401/403/500 errors) on academic tiers, existing subjects, topics, or source mappings were silently caught with `.catch(() => [])`, tricking the import engine into believing 0 records existed and causing mass subject and topic duplications.
2. **Unit-Omitted Concept Keys**: Matching keys relied solely on `topic::subtopic`, erroneously merging distinct concepts that shared names across different units (e.g. Unit 1 "Sorting" vs Unit 2 "Sorting").
3. **Session Loss & Partial Write Corruption**: If network or write quotas failed midway through importing hundreds of topics, there was no persistent tracking of committed records, leaving broken states and causing duplicate creation upon retrying.
4. **User Progress Regression Risks**: Ambiguous re-imports risked overwriting active user progress (Practice problems, Ebbinghaus revision history, PYQs, personal notes).

Step 4 redesigns the import engine with **zero-corruption critical reads**, **unit-aware concept identity**, **stable row mapping keys**, **recoverable atomic import sessions**, and **strict progress invariants**.

---

## 1. Zero-Corruption Failed-Read Architecture

### Problem
Previously, when reading existing tiers, subjects, topics, or source mappings, the code used patterns like:
```ts
// DANGEROUS PATTERN (REMOVED)
const existingSubjects = await api.getStudySubjects().catch(() => []);
```
When a Firestore read timeout or 500 error occurred, the engine interpreted the error as "0 subjects exist", immediately creating duplicate subjects and duplicate topics.

### Solution
- Introduced `StudyImportCriticalReadError` with structured codes:
  - `TIERS_READ_FAILED`
  - `PUBLIC_PULL_FAILED`
  - `CRITICAL_DUPLICATE_CHECK_FAILED`
  - `SOURCE_MAPPINGS_READ_FAILED`
- **Distinguishing Empty from Error**: Genuine empty collections return `[]` cleanly and succeed normally. Any network error, authentication rejection, or database error throws immediately, aborting the import session **before any database writes occur**.
- Users receive clear diagnostic feedback and can retry safely without data duplication.

---

## 2. Topic Identity & Unit Disambiguation

### Composite Key Hierarchy
Topic matching in `sheetToStudyImportEngine.ts` and `sheetToStudyTransformer.ts` now enforces a 3-tier identity priority:

1. **Priority 1: Stable Source Mapping Key (`sourceMappingKey`)**
   - Format: `computeSourceMappingKey(spreadsheetId, sheetId, sourceRowId)` -> `srowmap_${spreadsheetId}|${sheetId}|${sourceRowId}`.
   - Preserves topic identity even if the spreadsheet author renames the topic or subtopic text (e.g. "Sorting" renamed to "Advanced Sorting").
2. **Priority 2: Stable Source Row Key (`sourceRowKey`)**
   - Fallback if mapping has not been persisted yet.
3. **Priority 3: Unit-Aware Concept Key (`conceptKey`)**
   - Previously: `${cleanSubjectCode}|${topic.toLowerCase()}::${subtopic.toLowerCase()}`
   - **Now**: `${cleanSubjectCode}|${unit.toLowerCase()}|${topic.toLowerCase()}::${subtopic.toLowerCase()}`
   - Guarantees that identical topic/subtopic titles in different units (e.g. Unit 1 "Sorting" / "Analysis" vs Unit 2 "Sorting" / "Analysis") create **separate, distinct Study OS topics** and never collide or cross-merge.

### Ambiguity Detection
- If multiple topics in the same subject share identical concept keys, the import engine detects ambiguity, prevents blind overwrites, and assigns updates safely to the mapped topic.

---

## 3. Recoverable Import Sessions (`StudyImportSession`)

### Session Lifecycle
Every import now initializes an authenticated, durable session in `studyImportHistoryStore`:
- **Path**: `users/${userId}/settings/study_import_sessions/${sessionId}`
- **Statuses**:
  - `'in_progress'`: Initialized before the first subject or topic write; stores planned subject and topic counts.
  - `'completed'`: All subjects and topics committed successfully; records committed IDs.
  - `'partial'`: An error occurred mid-import after at least one subject or topic was saved.
  - `'failed'`: An error occurred before any subject or topic was committed.

### Safe Partial Retries (`retrySheetToStudyImport`)
When a retry is invoked with `resumeSessionId`:
1. The engine reloads the previous `StudyImportSession`.
2. Any subject whose ID is present in `committedSubjectIds` is skipped.
3. Any topic whose ID is present in `committedTopicIds` is skipped.
4. Only the uncommitted or failed records are processed and committed.
5. All database operations remain strictly idempotent with zero duplicates.

---

## 4. Critical User Progress & Data Preservation Rules

1. **Done Checkbox Invariant**:
   - Done = `TRUE` in Google Sheets maps **strictly to `theory = true`**.
   - `practice` is strictly preserved and remains untouched.
   - `pyq` is strictly preserved.
   - `revisionCount` (Ebbinghaus spaced repetition) is strictly preserved.
   - Personal user notes are preserved (empty sheet note cells never overwrite user notes).
2. **Non-Regressive Theory**:
   - If a topic has already been marked as `theory = true` in Study OS, unchecking Done in the spreadsheet does NOT revert `theory` back to `false`.
3. **No Deletion on Sheet Row Removal**:
   - Deleting or filtering out rows in Google Sheets never prunes or deletes Study OS topics. Study OS data is permanent and user-owned.

---

## 5. Files Modified

| File | Changes Made |
| :--- | :--- |
| `src/types/study.ts` | Added `StudyTopicSourceMapping`, `StudyImportSession`, source tracking fields on `StudyTopic`. |
| `src/lib/sheetHub/studyImportHistoryStore.ts` | Added methods for topic source mappings and recoverable import sessions. |
| `src/lib/sheetHub/sheetToStudyTransformer.ts` | Added `computeSourceMappingKey`, added `unit` to `conceptKey`. |
| `src/lib/sheetHub/sheetToStudyImportEngine.ts` | Throws `StudyImportCriticalReadError` on failed reads; enforces unit disambiguation; integrates session tracking; preserves all user progress. |
| `test/v1_8_sheet_import_integrity.test.ts` | 16 comprehensive unit tests covering read failures, unit disambiguation, re-import, sessions, retries, and progress preservation. |

---

## 6. Verification Summary

- **Existing Sheet Hub Test Suites**:
  - `test/sheet_to_study_import_engine.test.ts`: Passed (15/15)
  - `test/sheet_to_study_transformer.test.ts`: Passed (20/20)
  - `test/sheet_to_study_reimport.test.ts`: Passed (11/11)
  - `test/sheet_to_study_qa_audit.test.ts`: Passed (14/14)
- **New Step 4 Test Suite**:
  - `test/v1_8_sheet_import_integrity.test.ts`: Passed (16/16)
- **Full v1.8 Regression & Rules Suites**:
  - 175 tests across 47 suites passed cleanly (0 failures).
- **TypeScript & Build**:
  - `npm run typecheck`: 0 errors.
  - `npm run build:prod`: Built cleanly in 538ms.

