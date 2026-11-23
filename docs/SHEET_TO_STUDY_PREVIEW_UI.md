# Sheet Hub → Study OS Import Bridge: Preview UI & Interactive Workflow Specification

**Document:** `SHEET_TO_STUDY_PREVIEW_UI.md`  
**Phase:** Step 3 — Build Sheet Import Preview UI  
**Target Version:** FocusFlow & Finance v1.8.0  
**Status:** Implemented & Verified (Non-Destructive Preview Only)  
**Related Documents:** `SHEET_TO_STUDY_AUDIT.md`, `SHEET_TO_STUDY_MAPPING_DESIGN.md`, `SHEET_TO_STUDY_DATA_MODEL.md`, `SHEET_TO_STUDY_REIMPORT_RULES.md`

---

## 1. Executive Summary

In Step 3, the user interface and interactive mapping workflow for **Import to Study OS** have been implemented. This system enables users to import syllabus tabs from any connected Google Spreadsheet (including zero-auth public sheets) as **Study Subjects**, and map their rows as **Study Topics** into their chosen **Academic Tier**.

### Strict Step 3 Scope Guarantee
As required by the Step 3 design constraints:
- **Zero Firestore Writes:** No subjects or topics are written to Cloud Firestore during this step.
- **Pure Selection, Mapping, and Preview:** The wizard performs live schema inspection, column detection, composite key computation, and non-destructive preview analysis without mutating any existing database records.
- **Safety Invariant Enforced:** When `Done = TRUE` in the spreadsheet, the preview maps the topic with `Theory: Completed`, `Practice: Unchanged (Pending)`, and `PYQ: Unchanged (Pending)`.
- **Existing User Data Preserved:** Existing revisions, personal notes, Ebbinghaus interval repetitions, and mistake records are strictly protected.

---

## 2. Component Hierarchy & Architecture

```
src/
├── lib/sheetHub/
│   ├── sheetToStudyTransformer.ts    # Composite key hashing, column role inference, preview metrics
│   ├── rowIdentity.ts                # Deterministic 32-hex FNV-1a hashing engine
│   └── sheetHubStore.ts              # Tab metadata & byte-safe row chunking
├── components/sheets-hub/
│   ├── SheetHubView.tsx              # Primary Sheet Sync Hub workspace (Toolbar action button)
│   ├── SheetConnectionCard.tsx       # Sheet connection card menu ("Import to Study OS" kebab action)
│   └── ImportToStudyModal.tsx        # 5-step modal wizard & interactive preview UI
└── test/
    └── sheet_to_study_preview.test.ts # Comprehensive 21-test unit & invariant suite
```

---

## 3. Entry Points

The **Import to Study OS** workflow is accessible from two natural locations in the Sheet Hub:

1. **Active Workspace Header Toolbar (`SheetHubView.tsx`):**
   - Positioned prominently in the top header bar next to `Inspect Schema` and `Google Sheets`.
   - Rendered using `ThemeButton` with `GraduationCap` icon and styled with primary theme accent.
   - Automatically binds the active spreadsheet connection as the import source.

2. **Spreadsheet Card Action Menu (`SheetConnectionCard.tsx`):**
   - Available in the kebab (`...`) dropdown menu on every connection card in the Sheet Hub landing view.
   - Enables initiating an import directly from the spreadsheet list without needing to open the full sheet table view first.

---

## 4. 5-Step Interactive Import Wizard Walkthrough

The wizard is built inside a high-performance, accessible `ThemeModal` (`maxWidthClass="max-w-4xl"`) supporting dark/light mode, keyboard navigation (Escape to close), mobile-friendly sheet presentation, and a step indicator header.

### Step A: Select Academic Tier
- **Purpose:** Associate incoming subjects with a target Study OS academic tier.
- **Features:**
  - Displays existing tiers fetched live from `api.getStudyTiers()` (e.g., *College Semester Core*, *Campus Placements & SDE Skills*, *GATE CSE Theory & Depth*).
  - Fallback to canonical `DEFAULT_ACADEMIC_TIERS`.
  - Radio card selection with tier title, short badge, and description.
  - **Inline Tier Creator:** Users can expand an inline form to create a new custom Academic Tier (e.g. *"Master's Core & Research"*) with a single click via `api.saveStudyTier()`.
- **Validation:** User must select or create a tier before proceeding.

### Step B: Select Sheet Tabs
- **Purpose:** Choose which worksheet tabs contain syllabus/topic data.
- **Features:**
  - Lists all discovered tabs with title, row count, and column count.
  - **Smart Overview Tab Skipping:** Tabs identified as overview, summary, dashboard, KPI, instructions, or readme (via `isTabOverview`) are **deselected by default** with a warning badge.
  - Data tabs are selected by default.
  - Users have full manual override (checkbox selection, *Select All*, *Deselect All*).
- **Validation:** At least one tab must be selected to proceed.

### Step C: Map Subjects
- **Purpose:** Assign each selected sheet tab to a Study OS Subject.
- **Features:**
  - For each selected tab, displays the sheet tab title and row count.
  - **Dual Action Toggle:**
    1. **Create New Subject:**
       - Prefills subject name from tab title.
       - Auto-generates a clean Subject Code via `generateSubjectCode()` (e.g. *Database Management Systems* → `Sub_DBMS`, *COA* → `Sub_COA`, *Prob & Stats* → `Sub_ProbStats`).
       - Duplicate Code Warning: If the code already exists in Study OS, an amber indicator alerts the user and auto-appends `_2`.
       - Color Swatch: 8 theme color presets (Blue, Purple, Emerald, Amber, Rose, Cyan, Pink, Indigo).
    2. **Map to Existing Subject:**
       - Select dropdown listing all active `StudySubject`s in the user's workspace with code, name, and current topic counts.
- **Validation:** All selected tabs must have a valid subject code and name.

### Step D: Map Columns
- **Purpose:** Map Google Sheets headers to Study OS domain fields.
- **Features:**
  - Sub-tab switcher for multi-tab setups.
  - Columns table showing Sheet Header Name, Inferred Type, and Target Field Dropdown:
    - `Unit / Module`
    - `Topic (Main Topic)`
    - `Subtopic (Concept)`
    - `Done (Theory Completion)`
    - `Notes / References`
    - `Priority`
    - `Do Not Map (Ignore)`
  - **Semantic Inference Engine:** `inferColumnTarget` utilizes header keywords, pluralizations, and column type flags (checkbox/boolean) to automatically map columns on initial load.
  - Displays unmapped column count badge.

### Step E: Preview & Safety Check
- **Purpose:** Live audit and preview of the computed syllabus before any data is committed.
- **Features:**
  1. **Prominent Safety Guarantee Banner:**
     > 🛡️ **Non-Destructive Import Guarantee**  
     > *"Existing Study OS progress, revisions, PYQ data and personal notes will be preserved."*  
     > When rows have **Done = TRUE**, they map as:  
     > **Theory: Completed** • **Practice: Unchanged (Pending)** • **PYQ: Unchanged (Pending)**
  2. **8-Metric Summary Stat Bar:**
     - Tabs Selected
     - Subjects to Create
     - Subjects to Merge
     - New Topics
     - Existing Topics (Matched)
     - Duplicate Rows (in source sheet)
     - Invalid / Missing Rows (empty topic & subtopic)
     - Theory Completed
  3. **Interactive Preview Table:**
     - Tab filter dropdown (All Subjects or filter by specific subject).
     - Search input (real-time filtering across topic, subtopic, unit, notes, and subject name).
     - Column display: Subject Code, Unit, Topic & Subtopic, Priority Badge, Theory Status (`Completed` / `Pending`), Practice Status (`Unchanged (Pending)`), Match Status (`New Topic` / `Existing Match`).
  4. **Verification Action:**
     - "Confirm Preview & Verify Ready" button triggers a verified confirmation card and prepares staged configuration for Step 4 import execution.

---

## 5. Non-Destructive Invariants & Field Rules

| Source Value | Study OS Target Field | Mapping Behavior | Invariant Guarantee |
|---|---|---|---|
| `Module` / `Unit` | `unit` | Cleaned string (default: `"General"`) | Preserved |
| `Topic` | `topic` | Primary topic title | Preserved |
| `Subtopic` | `subtopic` | Specific concept title | Fallback to topic if blank |
| `Done = TRUE` | `theory` | `true` | **Theory: Completed** |
| `Done = FALSE` | `theory` | `false` | **Theory: Pending** |
| Any source value | `practice` | `false` | **Practice: Unchanged (Never overwritten)** |
| Any source value | `pyq` | `false` | **PYQ: Unchanged (Never overwritten)** |
| Any source value | `revisionCount` | `0` (or existing) | **Ebbinghaus intervals preserved** |
| `Notes` | `notes` | String or `undefined` | User notes preserved |
| `Priority` | `priority` | `'High' \| 'Medium' \| 'Low'` | Normalized |

---

## 6. Verification & Test Coverage

### Automated Test Suite (`test/sheet_to_study_preview.test.ts`)
- **Total Tests:** 21 unit & invariant tests
- **Passing:** 21 / 21 (100%)
- **Test Areas:**
  - Tab overview detection (`isTabOverview`): flags overview/summary tabs, preserves syllabus tabs.
  - Subject code generation (`generateSubjectCode`): canonical acronyms (DBMS, COA, OS, DSA), collision avoidance.
  - Column mapping inference (`inferColumnTarget`): Module, Topic, Subtopic, Done, Notes, Priority, plural variants.
  - Deterministic key calculation (`computeSourceRowKey`): 32-hex FNV-1a hash, physical row index independence.
  - Boolean & priority normalizer (`parseBooleanDone`, `normalizePriority`).
  - Preview generation engine (`generateImportPreview`): Theory=true / Practice=false invariant verification, duplicate row count, invalid row count, existing topic merging.

### Global Regressions & Build Status
- **TypeScript Typecheck (`npm run typecheck`):** Exited with code `0` (clean, zero errors).
- **Full Test Suite (`npm test`):** 762 passing tests, 0 failed, 37 skipped (emulator tests).
- **Production Build (`npm run build:prod`):** Built in 426ms (`dist/` generated with zero bundler warnings or errors).

