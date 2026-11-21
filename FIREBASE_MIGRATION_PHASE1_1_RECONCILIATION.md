# FOCUSFLOW — PHASE 1.1
## BACKUP MANIFEST RECONCILIATION & PRE-MIGRATION SAFETY GATE REPORT

**Report Document:** `FIREBASE_MIGRATION_PHASE1_1_RECONCILIATION.md`  
**Execution Timestamp:** 2026-11-21T02:44:00Z  
**Classification:** STRICT READ-ONLY FORENSIC AUDIT — ZERO DATA MODIFICATION  
**Source Project:** `seismic-codex-m01dl` (`#363778207392`)  
**Source Database:** `ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8` (`asia-southeast1`)  
**Target Project:** `focus-flow-by-atif` (Untouched)  
**Readiness Verdict:** **`READY WITH CONDITIONS`**

---

## 1. Task 1 — Actual Backup Artifact Verification

All Phase 1 backup files were verified directly on disk in `/Users/munshimdatif/Downloads/focusflow-migration-backup/` without regeneration or modification. Every file parsed with zero errors:

| File Name | Location | Size | Permissions | Parse Status | Structural Contents |
|---|---|---|---|---|---|
| `firestore-payload.jsonl` | `source-firestore/` | **1,877,409 bytes** | `-rw-------` (0600) | Valid JSONL | **259 discrete document records** |
| `document-manifest.json` | `source-firestore/` | **321,191 bytes** | `-rw-------` (0600) | Valid JSON | **259 sanitized document metadata entries** |
| `verification-hashes.json` | `source-firestore/` | **114,928 bytes** | `-rw-------` (0600) | Valid JSON | **259 dual-pass SHA-256 parity hashes** |
| `auth-users-metadata.json` | `source-auth/` | **5,116 bytes** | `-rw-------` (0600) | Valid JSON | **5 Google OAuth account records** |
| `backup-integrity-report.md`| `reports/` | **818 bytes** | `-rw-------` (0600) | Valid Markdown | **Machine verification audit summary** |
| `backup-metadata.json` | `reports/` | **5,863 bytes** | `-rw-------` (0600) | Valid JSON | **Structured distribution & size metadata** |

---

## 2. Task 2 & Task 3 — Manifest Comparison & Path Count Resolution

### Forensic Comparison: Phase 0.1 Manifest vs. Phase 1 Backup

Comparing `migration-source-manifest.json` against `source-firestore/document-manifest.json` and `firestore-payload.jsonl`:

- **Document Path Parity:** Exactly **259 / 259 paths match 100%**.
  - Missing documents: **0**
  - Added documents: **0**
  - Changed document paths: **0**
  - Duplicate paths: **0**
  - UID-level document distribution differences: **0**

### Explanation of the Collection Inventory Inconsistency

The underlying data files have **always contained the exact same 49 physical collection paths**. The apparent difference arose exclusively from how Section 7 of the Phase 1 narrative report was composed:

1. **The Prose Inconsistency:**
   - In `FIREBASE_MIGRATION_PHASE1_BACKUP_REPORT.md`, Section 7 did not draw from the true Firestore `collectionPath` attributes. Instead, the author hand-drafted a table using high-level domain concepts (such as `finance_transactions`, `finance_budgets`, `finance_wallets`, `analyticsDaily`, `expense_categories`, etc.).
   - These conceptual names **do not exist** in the Firestore database.
   - When that narrative table reached 47 rows, the author appended two pseudo-entries to force the table length to 49:
     - `48. users/qMEx2eXnahelAjbBqNCo4rmSI0B2 (Registered user, 0 docs)` *(An Authentication user with 0 Firestore collections)*.
     - `49. users/MgJFbPGlqmc9YCXravUjaSFYu2z2/subcollections (Aggregated)` *(A pseudo-category, not a collection path)*.

2. **The True Physical Reality:**
   - Both `migration-source-manifest.json` and `firestore-payload.jsonl` contain **exactly 49 physical Firestore collection paths**, all of which contain actual data ($N \ge 1$ document).
   - There are **26 unique `collectionId` names** in the database:
     `expenses`, `focus_sessions`, `income`, `interruptions`, `invitations`, `members`, `pomodoro_presets`, `row_chunks`, `settings`, `sharedVaults`, `sheet_connections`, `sheet_row_chunks`, `sheet_tabs`, `sheets`, `study_exams`, `study_mistakes`, `study_revisions`, `study_subjects`, `study_topics`, `subscriptions`, `sync_queue`, `tabs`, `tasks`, `users`, `vaultInvitations`, `activity`.

---

## 3. Authoritative Inventory of the 49 True Collection Paths

$$\text{Root Collections (3)} + \text{Vault Subcollections (3)} + \text{User Subcollections (43)} = \mathbf{49\text{ Physical Paths}}$$

```
┌────┬────────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────┬───────────┐
│ #  │ True Physical Collection Path                                                                  │ Collection ID    │ Doc Count │
├────┼────────────────────────────────────────────────────────────────────────────────────────────────┼──────────────────┼───────────┤
│ 1  │ sharedVaults                                                                                   │ sharedVaults     │ 1         │
│ 2  │ sharedVaults/vlt_1794905820679_7sjukb/activity                                                 │ activity         │ 4         │
│ 3  │ sharedVaults/vlt_1794905820679_7sjukb/invitations                                              │ invitations      │ 12        │
│ 4  │ sharedVaults/vlt_1794905820679_7sjukb/members                                                  │ members          │ 2         │
│ 5  │ users                                                                                          │ users            │ 4         │
│ 6  │ users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/focus_sessions                                              │ focus_sessions   │ 2         │
│ 7  │ users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/focus_sessions/foc_1794722788752_7wbg/interruptions        │ interruptions    │ 1         │
│ 8  │ users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/focus_sessions/foc_1794776720577_96bh/interruptions        │ interruptions    │ 1         │
│ 9  │ users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/pomodoro_presets                                            │ pomodoro_presets │ 3         │
│ 10 │ users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/settings                                                    │ settings         │ 3         │
│ 11 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/expenses                                                    │ expenses         │ 44        │
│ 12 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions                                              │ focus_sessions   │ 6         │
│ 13 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_1794812909807_logm/interruptions        │ interruptions    │ 3         │
│ 14 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_1794820898272_ndgl/interruptions        │ interruptions    │ 1         │
│ 15 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_1794820898308_uxs9/interruptions        │ interruptions    │ 1         │
│ 16 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/focus_sessions/foc_1794952287179_t51k/interruptions        │ interruptions    │ 2         │
│ 17 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/income                                                      │ income           │ 3         │
│ 18 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/pomodoro_presets                                            │ pomodoro_presets │ 3         │
│ 19 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/settings                                                    │ settings         │ 3         │
│ 20 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheet_connections                                            │ sheet_connections│ 1         │
│ 21 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheet_row_chunks                                             │ sheet_row_chunks │ 6         │
│ 22 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheet_tabs                                                   │ sheet_tabs       │ 5         │
│ 23 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets                                                       │ sheets           │ 1         │
│ 24 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/conn_1laOanGUQHU6UGwIrwhVQHjN_mwpaj38e/tabs          │ tabs             │ 5         │
│ 25 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/conn_..._tab_1/row_chunks                   │ row_chunks       │ 1         │
│ 26 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/conn_..._tab_2/row_chunks                   │ row_chunks       │ 1         │
│ 27 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/conn_..._tab_3/row_chunks                   │ row_chunks       │ 1         │
│ 28 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/conn_..._tab_4/row_chunks                   │ row_chunks       │ 2         │
│ 29 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sheets/.../tabs/conn_..._tab_5/row_chunks                   │ row_chunks       │ 1         │
│ 30 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/study_exams                                                 │ study_exams      │ 8         │
│ 31 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/study_subjects                                              │ study_subjects   │ 2         │
│ 32 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/study_topics                                                │ study_topics     │ 1         │
│ 33 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/subscriptions                                                │ subscriptions    │ 1         │
│ 34 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/sync_queue                                                   │ sync_queue       │ 51        │
│ 35 │ users/MgJFbPGlqmc9YCXravUjaSFYu2z2/tasks                                                        │ tasks            │ 3         │
│ 36 │ users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/focus_sessions                                              │ focus_sessions   │ 1         │
│ 37 │ users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/focus_sessions/foc_1794932208249_uqky/interruptions        │ interruptions    │ 4         │
│ 38 │ users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/pomodoro_presets                                            │ pomodoro_presets │ 3         │
│ 39 │ users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/settings                                                    │ settings         │ 3         │
│ 40 │ users/ulExgQM9Y5gMaOrjLfGk0FdzARm1/study_mistakes                                              │ study_mistakes   │ 2         │
│ 41 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/expenses                                                    │ expenses         │ 1         │
│ 42 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/pomodoro_presets                                            │ pomodoro_presets │ 3         │
│ 43 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/settings                                                    │ settings         │ 3         │
│ 44 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_mistakes                                              │ study_mistakes   │ 2         │
│ 45 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_revisions                                              │ study_revisions  │ 2         │
│ 46 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_subjects                                              │ study_subjects   │ 5         │
│ 47 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/study_topics                                                │ study_topics     │ 38        │
│ 48 │ users/wrl4anBq9MQme75LQkgp0Lfly4l2/sync_queue                                                   │ sync_queue       │ 1         │
│ 49 │ vaultInvitations                                                                                │ vaultInvitations │ 2         │
├────┴────────────────────────────────────────────────────────────────────────────────────────────────┴──────────────────┼───────────┤
│ TOTAL AUTHORITATIVE SOURCE DOCUMENTS                                                                                   │ 259       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴───────────┘
```

---

## 4. Task 4 — Payload Integrity & Deep Field Analysis

Parsing `firestore-payload.jsonl` confirmed:
- **Total Records:** Exactly 259 records.
- **Unique Document Paths:** Exactly 259.
- **Duplicate Document Records:** 0.
- **Malformed Lines:** 0.

### Field Accounting: Top-Level vs. Total Nested Values

$$\text{Top-Level Document Fields} = \mathbf{3,346}$$
$$\text{Total Typed Values (Including Nested Map & Array Elements)} = \mathbf{32,303}$$

The 3,346 figure reported in Phase 1 represents **top-level document field keys**. When all nested sub-elements within `mapValue` and `arrayValue` structures (e.g., spreadsheet row chunks, settings lists, sync payloads) are traversed recursively, the backup preserves **32,303 fully typed values**:

```
                       DEEP TYPED VALUE CENSUS (32,303 VALUES)
┌──────────────────────────────────────┬──────────────────────┬────────────────────────────────────────┐
│ Value Representation                 │ Total Count          │ Integrity Guarantee                    │
├──────────────────────────────────────┼──────────────────────┼────────────────────────────────────────┤
│ stringValue                          │ 16,984               │ UTF-8 preserved, zero truncation       │
│ nullValue                            │ 4,173                │ Preserved as native JSON null          │
│ mapValue                             │ 3,839                │ Full nested hierarchy preserved        │
│ integerValue                         │ 3,185                │ Preserved as discrete 64-bit int string│
│ booleanValue                         │ 2,750                │ Strict boolean true/false              │
│ arrayValue                           │ 1,352                │ Ordered list elements preserved        │
│ timestampValue                       │ 12                   │ RFC 3339 nano-second strings           │
│ doubleValue                          │ 8                    │ Exact IEEE floating-point numbers      │
└──────────────────────────────────────┴──────────────────────┴────────────────────────────────────────┘
```

---

## 5. Task 5 — Review of Pending Sync Queues (52 Items)

Inspection of `server/sheetsWorker.ts`, `src/lib/googleSheetsService.ts`, and `src/context/AppContext.tsx` revealed:

### Execution Behavior
1. **No Automatic Execution on Sign-In:** `flushQueue` is **not triggered simply by logging in**. It is only executed when:
   - The user clicks the manual "Sync Now" button in settings (`syncNowToGoogleSheets`),
   - A stopwatch focus session finishes while Google Sheets is connected,
   - A user performs an active task, expense, or bill modification in the UI.
2. **Idempotency of Append Operations:**
   - In `server/sheetsWorker.ts` (lines 581–593), before performing any append, the backend crawler calls `fetchExistingRecordLocations()` to read Column A of the target sheet.
   - If the entity ID (e.g. `exp_1794806517293_icnj`) already exists in Column A, the operation is **skipped as a duplicate** (`skippedDuplicates++`) and marked `completed`.
3. **Idempotency of Update Operations:**
   - For `update` operations, the worker targets the exact matching row in Column A (`A{existingRow}`). If the row exists, it updates in-place. If not, it appends. This is fully idempotent.
4. **Replay Risk Assessment:**
   - **Scenario A (Connected to Existing Spreadsheet):** Deduplication will find matching Column A IDs and mark the queue operations `completed` without writing duplicate rows.
   - **Scenario B (Connected to a Blank or New Spreadsheet):** Flushing the queue would append all 52 records to the new spreadsheet.
   - **In Firestore:** Importing the documents into target Firestore carries **zero risk of duplication** because all 52 documents have fixed deterministic IDs (e.g. `sq_Variable_Expenses_append_exp_...`). Batch-writing them will write exactly 52 documents.

---

## 6. Task 6 — Backup Security & Redundancy Certification

- **Local Permissions:** Directory `/Users/munshimdatif/Downloads/focusflow-migration-backup` is `drwx------` (mode `0700`). All individual files are `-rw-------` (mode `0600`).
- **Disk Encryption:** Verified via macOS CLI `fdesetup status`: **`FileVault is On`**. All local backup data is encrypted at rest.
- **Secondary Redundancy:** Created a physically distinct, read-only tarball archive:
  - Path: `/Users/munshimdatif/Downloads/focusflow-migration-backup-secondary.tar.gz` (244 KB).
  - Mode: `-r--------` (`0400` read-only for owner).
- **Repository Isolation:** Both backup locations reside in `~/Downloads/`, completely outside the Git repository. `git status` confirms zero sensitive backup files are tracked or staged.

---

## 7. Remaining Blockers & Pre-Migration Gate

Before Phase 2 restoration can begin, two mandatory prerequisites remain:

1. **Console Prerequisite 1: Firebase Authentication in `focus-flow-by-atif`**:
   - Identity Platform must be initialized by clicking **"Get Started"** in the Firebase Console.
   - Enable the **Google** sign-in provider (support email: `atifmunshi2122@gmail.com`).
   - Add authorized domains: `localhost`, `focus-flow-by-atif.vercel.app`, `focus-flow-by-atif.firebaseapp.com`.
2. **Console Prerequisite 2: Firestore Database in `focus-flow-by-atif`**:
   - Create the database with ID: **`(default)`**.
   - Location: **`asia-southeast1 (Singapore)`** *(must match source)*.
   - Mode: **Production mode**.

---

## 8. Final Safety Certification & Readiness Verdict

$$\mathbf{READINESS\ VERDICT:\ READY\ WITH\ CONDITIONS}$$

### Certified Conditions:
1. All 259 documents, 49 physical collection paths, and 5 user accounts are backed up with 100% bit-exact and type-exact fidelity.
2. The narrative table discrepancy in Phase 1 has been completely explained and corrected to the true 49 physical paths.
3. Target project `focus-flow-by-atif` remains untouched.
4. Source project `seismic-codex-m01dl` remains untouched.

**Next Action:** Await user execution of Console Prerequisites 1 & 2, followed by explicit authorization to begin **Phase 2: Target Project Restoration & Verification**.
