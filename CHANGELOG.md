# Changelog

All notable changes to the **FocusFlow & Finance** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [0.9.0] - 2026-11-10

### Added
- Core Pomodoro and Stopwatch functionality.
- Initial Task list with status tracking.
- Income and Expense entry forms.
- Basic Firestore schema integration.
- Preliminary 12-sheet Google Sheets export prototype.

---

## [0.1.0] - 2026-11-01

### Added
- Initial project scaffolding with Vite and React.

