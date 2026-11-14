# Changelog

All notable changes to the **FocusFlow & Finance** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.7.0] - 2026-11-14

### Security & Hardening
- **Firestore Security Rules Overhaul:** Delegated rule authoring to specialist `firestore-rules-author` subagent; added rigorous security rules for `habits`, `study_subjects`, `study_topics`, `study_revisions`, and `study_mistakes` subcollections with strict ownership (`isOwner(userId)`), document ID regex (`isValidId`), bounded length checks, and soft-delete diff verification.
- **API Input Validation:** Added strict type, regex, and enum validation to all Study OS endpoints in `server/routes.ts` via `server/validation.ts`.
- **Envelope Fund Transfer Hardening:** Added protection against same-envelope transfers (`fromId === toId`), non-integer amounts, and balance overdrafts in both Express routes and Firestore batch operations.

### Productivity & Timer Engine
- **Sleep/Wake & Background Tab Math:** Dynamic countdown and stopwatch calculation against absolute target epochs eliminates timer drift across hidden tabs and laptop sleep.
- **Refresh State Recovery:** LocalStorage snapshot (`ff_timer_state_v1`) enables seamless timer continuation across browser reloads.
- **Cross-Tab Synchronization:** Integrated `BroadcastChannel('ff_timer_sync_v1')` to mirror timer events (start, pause, reset, mode switches) across all open browser tabs in real time.
- **Multi-Tab Deduplication Lock:** Atomic completion lock (`acquireCompletionLock`) prevents duplicate session logs or redundant Google Sheets sync operations.

### Performance & Build Optimization
- **Vite Code Splitting:** Segmented heavy dependencies into manual chunks (`sheets-engine`, `theme-studio`, `study-module`).
- Reduced primary bundle size from 1,408 kB to 735 kB, resolving all chunk size warnings.
- Expanded automated test suite from 85 to 91 tests (`test/phase8_audit_upgrades.test.ts`), with 100% passing.

---

## [1.1.0] - 2026-11-13

### Added
- **Mobile-First UX Upgrades:**
  - Sticky bottom navigation bar for mobile (`lg:hidden`) supporting one-handed access to Dashboard, Focus, Tasks, Finance, and Settings with spring indicators and safe-area inset padding.
  - Native bottom-sheet presentation for modals (`ThemeModal`, `ConfirmDialogModal`, `QuickActionModal`, and Time-Block planner) on mobile screens with drag-handle indicators and keyboard-safe vertical scroll (`max-h-[85dvh]`).
  - Mobile Card Views in `TransactionsLedger` and `BillsTracker` replacing horizontally clipped tables on `< 640px` screens.
  - Dedicated touch drag handle (`GripVertical` with `touch-action: none`) and tap-to-edit interaction in `DailyTimeBlockPlanner`.
- **Firebase Infrastructure Integration:**
  - Active Firebase project migrated to `seismic-codex-m01dl`.
  - Registered web application credentials (`1:363778207392:web:3aacc9711ed002ecd0e3c5`).
  - Enterprise Native Mode Firestore database (`ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8`) rules and indexes deployed.
  - Google Sign-In authentication deployed via Firebase CLI.
  - Installed 14 official Firebase agent skills in `.agents/skills`.

### Fixed
- **Mobile Drawer Collapsed Width Bug:** Corrected responsive width in `Sidebar.tsx` (`w-64 ${collapsed ? 'lg:w-20' : 'lg:w-64'}`) ensuring the mobile drawer always renders at full width with complete navigation labels even if desktop sidebar was collapsed.
- **Viewport Height Cutoff:** Replaced `h-screen` (100vh) with `h-[100dvh]` to prevent clipping under dynamic mobile address bars.
- **Touch Target Ergonomics:** Elevated mobile buttons (hamburger trigger, table trash/edit buttons, bill payment buttons, modal actions) to meet the $\ge 44 \times 44\text{px}$ touch target guideline.
- **Pomodoro Dial Fluid Scaling:** Replaced static pixel dimensions with responsive SVG `viewBox` and fluid boundaries (`max-w-[75vw] max-h-[75vw]`) preventing overflow on compact 360px mobile screens.
- **Notch & PWA Safe-Area:** Configured `viewport-fit=cover` in `index.html` and applied `env(safe-area-inset-bottom)` with `-webkit-tap-highlight-color: transparent` in `index.css`.

---

## [1.0.0] - 2026-11-12

### Added
- **23-Worksheet Master Google Sheets Architecture:**
  - Executive dashboards: `Executive_Dashboard` (sheetId 100), `Finance_Dashboard` (101), `Productivity_Dashboard` (102).
  - Productivity data sheets: `Focus_Sessions`, `Focus_Daily`, `Focus_Weekly`, `Focus_Monthly`, `Tasks`, `Task_Analytics`, `Productivity_Goals`.
  - Finance data sheets: `Income`, `Fixed_Expenses`, `Variable_Expenses`, `Bills_Payments`, `Budgets`, `Savings_Goals`, `Finance_Daily`, `Finance_Weekly`, `Finance_Monthly`.
  - System metadata sheets: `Sync_Log` (121), `Settings` (122).
  - 5 native interactive charts embedded in dashboards (Income vs Expense column, Weekly Focus line, Fixed vs Variable donut, Net Savings area, Pomodoro column).
  - Decoupled styling architecture (`batchUpdate` formats once; `values:batchUpdate` syncs data without clearing formatting).
  - Durable server-side sync queue with exponential backoff and jitter retry mechanism.
- **Financial Arithmetic Engine:**
  - Strict integer paise arithmetic eliminating IEEE 754 floating-point drift across all transactions, envelopes, and bills.
  - Non-destructive payment undo with status update to `reversed` and preserved audit trails.
  - Atomic bill payments executed in single database transactions.
  - Idempotent recurring bill generation with composite period keys (`rec_{id}_{YYYY-MM}`).
- **Theme Studio & Ergonomics:**
  - 19 handcrafted design presets with verified WCAG 2.1 AA text contrast in Light and Dark modes.
  - Font pairings (Modern, Editorial, Technical) using dynamic CSS variables.
  - Reduced-motion accessibility honoring `prefers-reduced-motion: reduce`.
- **Automated Regression Suite:**
  - 39 automated unit and integration test suites covering all 13 core modules.
  - Zero-drift 10,000-operation finance precision stress test.
  - Mobile touch target ($\ge 44 \times 44\text{px}$) and responsive breakpoint assertions.
  - Failure injection and simulated network/API 429 recovery tests.
- **Enterprise Operational Documentation:**
  - `README.md`, `RELEASE_PROCESS.md`, `BACKUP_RECOVERY_GUIDE.md`, `MAINTENANCE_GUIDE.md`, `DATABASE_MIGRATION_GUIDE.md`, `INCIDENT_RESPONSE_GUIDE.md`, `SYSTEM_ARCHITECTURE.md`.

### Changed
- Refactored timer engine from setInterval counters to millisecond-accurate delta timestamps using `Date.now()`.
- Standardized date and timezone handling to `Asia/Kolkata` (`UTC+05:30`) with month-end date clamping.
- Optimized bundle size from 1.9MB monolithic build to clean 4-way vendor chunking (`vendor-firebase`, `vendor-react`, `vendor-motion`, `vendor-lucide`), reducing build time to 469ms.
- Upgraded table components with configurable pagination (10, 25, 50, 100 rows) for high-density ledgers.

### Security
- Implemented RSA-SHA256 JWT signature verification against Google's public x509 certificates.
- Added in-memory sliding-window rate limiter (300 requests/minute per client IP) on all `/api/*` endpoints.
- Enforced HTTP security headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`).
- Added console log sanitizer that redacts credentials, JWT tokens, PAN/Aadhaar numbers, and credit card patterns.
- Hardened Firestore Security Rules with subcollection-level tenant isolation and strict field schema validations.

### Removed
- Removed legacy local storage sync queues in favor of durable Firestore sync queues.
- Removed all external AI dependencies and prototype mock endpoints to guarantee 100% deterministic operation.

---

## [1.1.0] - 2026-11-13

### Added
- **Mobile-First UX Upgrades:**
  - Sticky bottom navigation bar for mobile (`lg:hidden`) supporting one-handed access to Dashboard, Focus, Tasks, Finance, and Settings with spring indicators and safe-area inset padding.
  - Native bottom-sheet presentation for modals (`ThemeModal`, `ConfirmDialogModal`, `QuickActionModal`, and Time-Block planner) on mobile screens with drag-handle indicators and keyboard-safe vertical scroll (`max-h-[85dvh]`).
  - Mobile Card Views in `TransactionsLedger` and `BillsTracker` replacing horizontally clipped tables on `< 640px` screens.
  - Dedicated touch drag handle (`GripVertical` with `touch-action: none`) and tap-to-edit interaction in `DailyTimeBlockPlanner`.
- **Firebase Infrastructure Integration:**
  - Active Firebase project migrated to `seismic-codex-m01dl`.
  - Registered web application credentials (`1:363778207392:web:3aacc9711ed002ecd0e3c5`).
  - Enterprise Native Mode Firestore database (`ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8`) rules and indexes deployed.
  - Google Sign-In authentication deployed via Firebase CLI.
  - Installed 14 official Firebase agent skills in `.agents/skills`.

### Fixed
- **Mobile Drawer Collapsed Width Bug:** Corrected responsive width in `Sidebar.tsx` (`w-64 ${collapsed ? 'lg:w-20' : 'lg:w-64'}`) ensuring the mobile drawer always renders at full width with complete navigation labels even if desktop sidebar was collapsed.
- **Viewport Height Cutoff:** Replaced `h-screen` (100vh) with `h-[100dvh]` to prevent clipping under dynamic mobile address bars.
- **Touch Target Ergonomics:** Elevated mobile buttons (hamburger trigger, table trash/edit buttons, bill payment buttons, modal actions) to meet the $\ge 44 \times 44\text{px}$ touch target guideline.
- **Pomodoro Dial Fluid Scaling:** Replaced static pixel dimensions with responsive SVG `viewBox` and fluid boundaries (`max-w-[75vw] max-h-[75vw]`) preventing overflow on compact 360px mobile screens.
- **Notch & PWA Safe-Area:** Configured `viewport-fit=cover` in `index.html` and applied `env(safe-area-inset-bottom)` with `-webkit-tap-highlight-color: transparent` in `index.css`.

---

## [0.9.0] - 2026-11-10

### Added
- Core Pomodoro and Stopwatch functionality.
- Initial Task list with status tracking.
- Income and Expense entry forms.
- Basic Firestore schema integration.
- Preliminary 12-sheet Google Sheets export prototype.

---

## [1.1.0] - 2026-11-13

### Added
- **Mobile-First UX Upgrades:**
  - Sticky bottom navigation bar for mobile (`lg:hidden`) supporting one-handed access to Dashboard, Focus, Tasks, Finance, and Settings with spring indicators and safe-area inset padding.
  - Native bottom-sheet presentation for modals (`ThemeModal`, `ConfirmDialogModal`, `QuickActionModal`, and Time-Block planner) on mobile screens with drag-handle indicators and keyboard-safe vertical scroll (`max-h-[85dvh]`).
  - Mobile Card Views in `TransactionsLedger` and `BillsTracker` replacing horizontally clipped tables on `< 640px` screens.
  - Dedicated touch drag handle (`GripVertical` with `touch-action: none`) and tap-to-edit interaction in `DailyTimeBlockPlanner`.
- **Firebase Infrastructure Integration:**
  - Active Firebase project migrated to `seismic-codex-m01dl`.
  - Registered web application credentials (`1:363778207392:web:3aacc9711ed002ecd0e3c5`).
  - Enterprise Native Mode Firestore database (`ai-studio-focusflowfinance-34a065b9-d0d0-4728-b07d-d2b9028624a8`) rules and indexes deployed.
  - Google Sign-In authentication deployed via Firebase CLI.
  - Installed 14 official Firebase agent skills in `.agents/skills`.

### Fixed
- **Mobile Drawer Collapsed Width Bug:** Corrected responsive width in `Sidebar.tsx` (`w-64 ${collapsed ? 'lg:w-20' : 'lg:w-64'}`) ensuring the mobile drawer always renders at full width with complete navigation labels even if desktop sidebar was collapsed.
- **Viewport Height Cutoff:** Replaced `h-screen` (100vh) with `h-[100dvh]` to prevent clipping under dynamic mobile address bars.
- **Touch Target Ergonomics:** Elevated mobile buttons (hamburger trigger, table trash/edit buttons, bill payment buttons, modal actions) to meet the $\ge 44 \times 44\text{px}$ touch target guideline.
- **Pomodoro Dial Fluid Scaling:** Replaced static pixel dimensions with responsive SVG `viewBox` and fluid boundaries (`max-w-[75vw] max-h-[75vw]`) preventing overflow on compact 360px mobile screens.
- **Notch & PWA Safe-Area:** Configured `viewport-fit=cover` in `index.html` and applied `env(safe-area-inset-bottom)` with `-webkit-tap-highlight-color: transparent` in `index.css`.

---

## [0.1.0] - 2026-11-01

### Added
- Initial project scaffolding with Vite and React.

